CREATE TABLE `price_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`alertType` enum('above','below') NOT NULL,
	`targetPrice` decimal(18,4) NOT NULL,
	`note` varchar(255),
	`triggered` boolean NOT NULL DEFAULT false,
	`triggeredAt` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `price_alerts_id` PRIMARY KEY(`id`)
);
