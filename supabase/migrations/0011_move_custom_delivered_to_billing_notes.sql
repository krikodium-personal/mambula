-- Delivery status should only be SI/NO. Historical free-text values move to billing_notes.
UPDATE public.sales
SET
  billing_notes = CASE
    WHEN billing_notes IS NULL OR btrim(billing_notes) = '' THEN btrim(delivered)
    ELSE btrim(billing_notes) || E'\n' || btrim(delivered)
  END,
  delivered = NULL
WHERE delivered IS NOT NULL
  AND btrim(delivered) <> ''
  AND lower(btrim(delivered)) NOT IN ('si', 'no');
