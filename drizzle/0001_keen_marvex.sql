CREATE TABLE `cash_balance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`balance` decimal(18,2) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_balance_id` PRIMARY KEY(`id`),
	CONSTRAINT `cash_balance_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `cash_flows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(20) NOT NULL,
	`inflow` decimal(18,2) NOT NULL DEFAULT '0',
	`outflow` decimal(18,2) NOT NULL DEFAULT '0',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cash_flows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`name` text NOT NULL,
	`shares` decimal(18,6) NOT NULL,
	`avgCost` decimal(18,4) NOT NULL,
	`sector` varchar(64) DEFAULT 'Other',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `holdings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trailing_stops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`trailPct` decimal(5,2) NOT NULL DEFAULT '15',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trailing_stops_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`name` text NOT NULL,
	`sector` varchar(64) DEFAULT 'Other',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watchlist_id` PRIMARY KEY(`id`)
);
