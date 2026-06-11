-- peak_hours (une plage d'heures PLEINES par jour : { "1": { "start": 18, "end": 22 } })
-- devient off_peak_hours (plusieurs plages CREUSES par jour : { "1": [{ "start": 9, "end": 12 }] }).
-- Conversion fidèle : le complément de l'ancienne fenêtre pleine dans 0-24 devient
-- les plages creuses du jour ; un jour entièrement plein (0-24) disparaît.
ALTER TABLE "clubs" RENAME COLUMN "peak_hours" TO "off_peak_hours";

UPDATE "clubs" c
SET "off_peak_hours" = (
  SELECT jsonb_object_agg(e.key, r.arr)
  FROM jsonb_each(c."off_peak_hours") e
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(x ORDER BY (x->>'start')::int) AS arr
    FROM (
      SELECT jsonb_build_object('start', 0, 'end', (e.value->>'start')::int) AS x
      WHERE (e.value->>'start')::int > 0
      UNION ALL
      SELECT jsonb_build_object('start', (e.value->>'end')::int, 'end', 24)
      WHERE (e.value->>'end')::int < 24
    ) s
  ) r
  WHERE r.arr IS NOT NULL
)
WHERE c."off_peak_hours" IS NOT NULL;
