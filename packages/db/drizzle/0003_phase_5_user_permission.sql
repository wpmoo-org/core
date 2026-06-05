CREATE TABLE "user_permission" (
	"user_id" text NOT NULL,
	"permission_id" text NOT NULL,
	"granted" boolean NOT NULL,
	"granted_by_user_id" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permission_pk" PRIMARY KEY("user_id","permission_id")
);
--> statement-breakpoint
ALTER TABLE "user_permission" ADD CONSTRAINT "user_permission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_permission" ADD CONSTRAINT "user_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_permission" ADD CONSTRAINT "user_permission_granted_by_user_id_user_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_permission_permission_id_idx" ON "user_permission" USING btree ("permission_id");
--> statement-breakpoint
CREATE INDEX "user_permission_granted_by_user_id_idx" ON "user_permission" USING btree ("granted_by_user_id");
