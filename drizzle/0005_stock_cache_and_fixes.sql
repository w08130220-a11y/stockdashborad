CREATE TABLE IF NOT EXISTS `stock_cache` (
  `id` int AUTO_INCREMENT NOT NULL,
  `symbol` varchar(20) NOT NULL,
  `data` text NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `stock_cache_id` PRIMARY KEY(`id`),
  CONSTRAINT `stock_cache_symbol_unique` UNIQUE(`symbol`)
);--> statement-breakpoint
ALTER TABLE `trailing_stops` ADD UNIQUE INDEX `trailing_user_symbol_idx` (`userId`, `symbol`);
