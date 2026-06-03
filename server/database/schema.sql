CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,

    username VARCHAR(255) UNIQUE NOT NULL,

    password_hash VARCHAR(255) NOT NULL,

    role ENUM('admin', 'user') DEFAULT 'user',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

CREATE TABLE IF NOT EXISTS matches (
    id INT AUTO_INCREMENT PRIMARY KEY,

    game_type VARCHAR(50) NOT NULL,

    winner_id INT NULL,

    started_at DATETIME NOT NULL,

    ended_at DATETIME NOT NULL,

    duration_seconds INT NOT NULL
)

CREATE TABLE IF NOT EXISTS match_players (
    id INT AUTO_INCREMENT PRIMARY KEY,

    match_id INT NOT NULL,

    user_id INT NULL,

    username VARCHAR(50) NOT NULL,

    placement INT NOT NULL,

    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
)