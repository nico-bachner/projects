CREATE TABLE `batches` (
	`id` integer PRIMARY KEY,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`pdf_key` text,
	`submitted_at` text,
	`reimbursed_at` text
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY,
	`member_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`vendor` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`discipline` text,
	`receipt_key` text,
	`receipt_sha256` text,
	`status` text NOT NULL,
	`batch_id` integer,
	`source` text NOT NULL,
	`import_key` text UNIQUE,
	`discord_thread_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT `fk_expenses_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`),
	CONSTRAINT `fk_expenses_batch_id_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`),
	CONSTRAINT "expenses_date" CHECK("date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "expenses_amount_cents" CHECK("amount_cents" > 0),
	CONSTRAINT "expenses_category" CHECK(category IN ('Competitions', 'Events', 'Gear', 'Merchandise', 'Trips', 'Website')),
	CONSTRAINT "expenses_discipline" CHECK(discipline IN ('Flatwater', 'Polo', 'Whitewater')),
	CONSTRAINT "expenses_status" CHECK(status IN ('submitted', 'changes_requested', 'approved', 'rejected', 'signed_off', 'submitted_to_sus', 'reimbursed')),
	CONSTRAINT "expenses_source" CHECK(source IN ('import', 'discord'))
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`discord_id` text UNIQUE
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY,
	`expense_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`decision` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT `fk_reviews_expense_id_expenses_id_fk` FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`),
	CONSTRAINT `fk_reviews_member_id_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`),
	CONSTRAINT "reviews_decision" CHECK(decision IN ('approve', 'request_changes', 'reject', 'sign_off')),
	CONSTRAINT "reviews_note" CHECK("decision" IN ('approve', 'sign_off') OR "note" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `expenses_status` ON `expenses` (`status`);--> statement-breakpoint
CREATE INDEX `expenses_receipt_sha256` ON `expenses` (`receipt_sha256`);--> statement-breakpoint
CREATE INDEX `reviews_expense_id` ON `reviews` (`expense_id`);