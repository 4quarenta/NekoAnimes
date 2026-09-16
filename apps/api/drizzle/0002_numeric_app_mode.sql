ALTER TABLE "app_config" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "app_config" ALTER COLUMN "mode" TYPE smallint USING CASE
  WHEN char_length("mode"::text) = 4 THEN 2
  WHEN char_length("mode"::text) = 9 THEN 1
  ELSE 1
END;
ALTER TABLE "app_config" ALTER COLUMN "mode" SET DEFAULT 1;
DROP TYPE IF EXISTS "public"."app_mode";
