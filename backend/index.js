import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js';
import casesRouter from './routes/cases.js';
import progressRouter from './routes/progress.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Роуты
app.use('/api/cases', casesRouter);
app.use('/api/progress', progressRouter);

// Healthcheck для Railway
app.get('/health', (req, res) => res.json({ ok: true }));

// Инициализация БД при старте
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                      SERIAL PRIMARY KEY,
      telegram_id             BIGINT UNIQUE NOT NULL,
      username                VARCHAR(255) DEFAULT '',
      first_name              VARCHAR(255) DEFAULT '',
      subscription_type       VARCHAR(20) DEFAULT 'free',
      subscription_expires_at TIMESTAMP,
      created_at              TIMESTAMP DEFAULT NOW(),
      last_seen_at            TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cases (
      id           SERIAL PRIMARY KEY,
      title        VARCHAR(255) NOT NULL,
      case_number  INT UNIQUE NOT NULL,
      difficulty   VARCHAR(20) DEFAULT 'medium',
      puzzle_data  JSONB NOT NULL DEFAULT '{}',
      is_free      BOOLEAN DEFAULT FALSE,
      published_at TIMESTAMP,
      created_at   TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_progress (
      id             SERIAL PRIMARY KEY,
      user_id        INT REFERENCES users(id) ON DELETE CASCADE,
      case_id        INT REFERENCES cases(id) ON DELETE CASCADE,
      status         VARCHAR(20) DEFAULT 'in_progress',
      found_words    JSONB DEFAULT '[]',
      hint_used      BOOLEAN DEFAULT FALSE,
      answers        JSONB DEFAULT '{}',
      time_spent_sec INT DEFAULT 0,
      started_at     TIMESTAMP DEFAULT NOW(),
      completed_at   TIMESTAMP,
      last_saved_at  TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, case_id)
    );
  `);
  console.log('✅ БД инициализирована');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await initDB();
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
