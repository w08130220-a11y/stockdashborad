ALTER TABLE `holdings` ADD `market` enum('US','TW') DEFAULT 'US' NOT NULL;--> statement-breakpoint
ALTER TABLE `holdings` ADD `currency` enum('USD','TWD') DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `watchlist` ADD `market` enum('US','TW') DEFAULT 'US' NOT NULL;--> statement-breakpoint
ALTER TABLE `watchlist` ADD `currency` enum('USD','TWD') DEFAULT 'USD' NOT NULL;