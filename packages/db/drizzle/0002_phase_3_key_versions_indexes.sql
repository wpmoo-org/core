ALTER TABLE "account" ADD COLUMN "access_token_key_version" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "refresh_token_key_version" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "id_token_key_version" text;--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN "secret_key_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_email_lower_idx" ON "user" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "user_created_at_idx" ON "user" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");