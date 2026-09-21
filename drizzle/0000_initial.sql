CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`category` text,
	`priority` text DEFAULT 'medium',
	`plannedMinutes` integer,
	`recurrenceRule` text,
	`defaultStartTime` text,
	`soundEnabled` integer DEFAULT 1,
	`autoStartEnabled` integer DEFAULT 1,
	`active` integer DEFAULT 1,
	`createdAt` integer
);
--> statement-breakpoint
CREATE TABLE `occurrence` (
	`id` text PRIMARY KEY NOT NULL,
	`taskId` text NOT NULL REFERENCES `task`(`id`) ON DELETE CASCADE,
	`scheduledDate` text NOT NULL,
	`scheduledStart` integer NOT NULL,
	`scheduledEnd` integer,
	`notificationId` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`actualStartTime` integer,
	`actualEndTime` integer,
	`actualDuration` integer DEFAULT 0,
	`remainingDuration` integer,
	`lastStartedAt` integer,
	`pausedAt` integer,
	`sirenTriggered` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `completionLog` (
	`id` text PRIMARY KEY NOT NULL,
	`occurrenceId` text NOT NULL REFERENCES `occurrence`(`id`) ON DELETE CASCADE,
	`status` text NOT NULL,
	`actualStart` integer,
	`actualEnd` integer,
	`actualDuration` integer,
	`completedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_task_date` ON `occurrence` (`taskId`,`scheduledDate`);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_date` ON `occurrence` (`scheduledDate`);
--> statement-breakpoint
CREATE INDEX `idx_occurrence_status` ON `occurrence` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_completion_occurrence` ON `completionLog` (`occurrenceId`);
