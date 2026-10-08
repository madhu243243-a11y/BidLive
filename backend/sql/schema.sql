-- Reference for a fresh BidLive database. The server does not run this file.
-- The API has been aligned to the user's existing tables as provided.
CREATE DATABASE IF NOT EXISTS bidlive CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE bidlive;

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL COMMENT 'bcrypt password hash only',
  role ENUM('buyer','seller') NOT NULL DEFAULT 'buyer',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS auctions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  seller_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category VARCHAR(100) NOT NULL,
  image_url VARCHAR(500) NULL,
  starting_price DECIMAL(10,2) NOT NULL,
  current_bid DECIMAL(10,2) NOT NULL,
  minimum_increment DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  end_time DATETIME NOT NULL,
  status ENUM('active','ended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY seller_id (seller_id),
  CONSTRAINT auctions_ibfk_1 FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bids (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  auction_id INT NOT NULL,
  bidder_id INT NOT NULL,
  bid_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  KEY auction_id (auction_id), KEY bidder_id (bidder_id),
  CONSTRAINT bids_ibfk_1 FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
  CONSTRAINT bids_ibfk_2 FOREIGN KEY (bidder_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS watchlist (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  auction_id INT NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_watchlist (user_id, auction_id),
  KEY auction_id (auction_id),
  CONSTRAINT watchlist_ibfk_1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT watchlist_ibfk_2 FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
