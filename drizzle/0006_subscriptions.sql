-- Subscription system tables
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `planId` enum('free','pro','premium') NOT NULL DEFAULT 'free',
  `status` enum('active','trialing','past_due','canceled','expired','paused') NOT NULL DEFAULT 'active',
  `billingCycle` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
  `paymentProvider` enum('stripe','apple','google','manual'),
  `providerSubId` varchar(255),
  `providerCustomerId` varchar(255),
  `currentPeriodStart` timestamp,
  `currentPeriodEnd` timestamp,
  `cancelAtPeriodEnd` boolean NOT NULL DEFAULT false,
  `trialEndDate` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
  CONSTRAINT `subscriptions_userId_unique` UNIQUE(`userId`)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `payment_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `subscriptionId` int,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'USD',
  `paymentStatus` enum('succeeded','pending','failed','refunded') NOT NULL DEFAULT 'pending',
  `paymentProvider2` enum('stripe','apple','google','manual'),
  `providerPaymentId` varchar(255),
  `description` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `payment_history_id` PRIMARY KEY(`id`)
);--> statement-breakpoint

CREATE INDEX `payment_history_userId_idx` ON `payment_history` (`userId`);
