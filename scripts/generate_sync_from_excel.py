#!/usr/bin/env python3
"""
Lee Ventas Mambula *.xlsx (pestañas VENTAS + Promocionales) y escribe
supabase/migrations/0022_resync_sales_excel_order.sql (DELETE + INSERT + promos).

Requiere haber aplicado antes la migración 0021_sales_sheet_position.sql.

Uso:
  python3 scripts/generate_sync_from_excel.py "/ruta/archivo.xlsx" [ruta_salida.sql]
"""

from __future__ import annotations

import json
import re
import sys
from decimal import Decimal
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
# Por defecto escribe la resincronización con orden de planilla (ejecutar tras 0021).
DEFAULT_OUT = ROOT / "supabase/migrations/0022_resync_sales_excel_order.sql"

SOLD_AT = "2026-05-09"
SOC_PROMO = frozenset({"Delfi", "Mechi", "Susan"})


def esc_sql(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def num_cell(v) -> int:
    if v is None:
        return 0
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, (int,)):
        return int(v)
    if isinstance(v, float):
        return int(round(v))
    if isinstance(v, Decimal):
        return int(v)
    s = str(v).strip().replace("$", "").replace(" ", "")
    if not s:
        return 0
    s = s.replace(".", "").replace(",", ".") if "," in s and "." not in s else s.replace(",", "")
    try:
        return int(round(float(s)))
    except ValueError:
        return 0


def infer_payment_method(notes: str | None, billing_parts: list[str]) -> str:
    blob = " ".join([notes or ""] + billing_parts).lower()
    if "efectivo" in blob:
        return "efectivo"
    if "mercado" in blob or "transfer" in blob or "mambula" in blob or "cuenta" in blob:
        return "transferencia"
    return "otro"


def invoice_status_from_fact(fact) -> str:
    if fact is None or str(fact).strip() == "":
        return "pendiente"
    fs = str(fact).strip().upper()
    if "SIN FACTURA" in fs:
        return "pendiente"
    if fs.startswith("SI"):
        return "facturado"
    return "pendiente"


def delivered_cell(ent) -> str | None:
    if ent is None or str(ent).strip() == "":
        return None
    s = str(ent).strip()
    if s.upper() == "SI":
        return "SI"
    return s


def parse_ventas(ws) -> list[tuple]:
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    header = rows[0]
    out: list[tuple] = []
    for r in rows[1:]:
        if not r or not r[0]:
            continue
        buyer = str(r[0]).strip()
        if buyer.upper() == "TOTAL":
            continue
        qty = r[1]
        unit_p = r[2]
        total_x = r[3]
        seller = str(r[4]).strip() if r[4] else ""
        pagado = r[5]
        entregado = r[6]
        facturado = r[7]
        notas = str(r[8]).strip() if len(r) > 8 and r[8] else ""

        q = num_cell(qty) if qty is not None else None
        if q is None or q <= 0:
            continue

        if not seller:
            seller = "Susan"

        up = num_cell(unit_p) if unit_p is not None else None
        if up is None or up <= 0:
            up = 15000

        total_calc = q * up
        tx = num_cell(total_x) if total_x is not None else 0
        if tx > 0 and abs(tx - total_calc) > total_calc * 0.15:
            pass

        paid_raw = num_cell(pagado)
        paid = min(paid_raw, total_calc) if total_calc > 0 else paid_raw

        inv = invoice_status_from_fact(facturado)

        billing_parts: list[str] = []
        if notas:
            billing_parts.append(notas)
        if facturado and str(facturado).strip() and str(facturado).strip().upper() not in ("SI", "TRUE"):
            billing_parts.append(str(facturado).strip())
        elif facturado and "," in str(facturado):
            billing_parts.append(str(facturado).strip())

        billing_note = " · ".join(billing_parts) if billing_parts else None

        pay_method = infer_payment_method(notas, billing_parts)

        delivered = delivered_cell(entregado)

        if paid >= total_calc and total_calc > 0:
            pay_stat = "cobrado"
            paid_adj = total_calc
        elif paid > 0:
            pay_stat = "pendiente"
            paid_adj = paid
        else:
            pay_stat = "pendiente"
            paid_adj = 0

        out.append(
            (
                buyer,
                seller if seller else None,
                q,
                up,
                pay_method,
                pay_stat,
                paid_adj,
                delivered,
                billing_note,
                inv,
            )
        )
    return out


def parse_promos(ws) -> dict[str, list[dict]]:
    rows = list(ws.iter_rows(values_only=True))
    groups = {"equipo": [], "colaboracion": [], "influencers": [], "colegio": []}
    group = "equipo"
    for r in rows[1:]:
        if not r or r[0] is None:
            continue
        a = str(r[0]).strip()
        if not a:
            continue
        al = a.lower()
        if al == "total":
            continue
        if "colab" in al:
            group = "colaboracion"
            continue
        if al == "influencers":
            group = "influencers"
            continue
        if "colegio" in al:
            group = "colegio"
            continue
        if al in ("equipo",):
            continue

        unidades = num_cell(r[1]) if len(r) > 1 else 1
        por = r[2] if len(r) > 2 else None
        por_s = str(por).strip() if por is not None else ""
        if por_s in SOC_PROMO:
            entregado = True
            entregado_por = por_s
        else:
            entregado = False
            entregado_por = None

        groups[group].append(
            {
                "nombre": a,
                "unidades": max(1, unidades),
                "entregado": entregado,
                "entregadoPor": entregado_por,
            }
        )
    return groups


def main():
    xlsx = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    out_path = Path(sys.argv[2]).expanduser() if len(sys.argv) > 2 else DEFAULT_OUT
    if not xlsx or not xlsx.is_file():
        print(
            "Uso: python3 scripts/generate_sync_from_excel.py /ruta/al/archivo.xlsx [ruta_salida.sql]",
            file=sys.stderr,
        )
        sys.exit(1)

    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    ventas = parse_ventas(wb["VENTAS"])
    promos = parse_promos(wb["Promocionales"])
    wb.close()

    lines = [
        "-- Resincronización desde Excel (mismo contenido que la importación + orden de planilla).",
        "-- Requiere migración 0021_sales_sheet_position.sql aplicada antes.",
        "-- Fecha de venta unificada:",
        f"-- sold_at = {SOLD_AT}",
        "",
        "delete from public.sales;",
        "",
        "insert into public.sales (",
        "  sold_at, buyer, seller, quantity, unit_price_ars,",
        "  payment_method, payment_status, paid_ars, delivered, billing_notes, invoice_status,",
        "  sheet_position",
        ") values",
    ]

    value_lines = []
    for pos, row in enumerate(ventas, start=1):
        buyer, seller, q, up, pm, ps, paid, deliv, bill, inv = row
        value_lines.append(
            "  ("
            + f"{esc_sql(SOLD_AT)}::date, "
            + f"{esc_sql(buyer)}, "
            + (esc_sql(seller) if seller else "NULL")
            + ", "
            + f"{q}, {up}, "
            + f"{esc_sql(pm)}, {esc_sql(ps)}, {paid}, "
            + (esc_sql(deliv) if deliv else "NULL")
            + ", "
            + (esc_sql(bill) if bill else "NULL")
            + ", "
            + f"{esc_sql(inv)}, "
            + f"{pos}"
            + ")"
        )

    lines.append(",\n".join(value_lines) + ";")
    lines.append("")

    promo_json = json.dumps(promos, ensure_ascii=False, separators=(",", ":"))
    lines.append(
        "update public.project_settings ps"
        "\nset promocional_rows = "
        + "'" + promo_json.replace("'", "''") + "'::jsonb"
        + "\nwhere ps.id = (select id from public.project_settings limit 1);"
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Escrito {out_path} ({len(ventas)} ventas, grupos promo: { {k: len(v) for k, v in promos.items()} }).")


if __name__ == "__main__":
    main()
