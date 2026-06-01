import pool from './db.js';
import dotenv from 'dotenv';
dotenv.config();

const cases = [
  {
    title: 'Смерть в особняке',
    case_number: 1,
    difficulty: 'easy',
    is_free: true,
    puzzle_data: {
      words_in_grid: [
        'НАТАША', 'БОРИС', 'АНДРЕЙ',
        'СЛЕДЫ', 'УЛИКА', 'МОТИВ', 'АЛИБИ',
        'КИНЖАЛ', 'ЯБЛОКО',
        'ПОДВАЛ', 'ТЕРРАСА'
      ],
      absent_words: {
        killer: 'ВИКТОР',
        method: 'ОТРАВА'
      },
      location_answer: 'БИБЛИОТЕКА'
    }
  },
  {
    title: 'Тайна старого театра',
    case_number: 2,
    difficulty: 'easy',
    is_free: true,
    puzzle_data: {
      words_in_grid: [
        'СЕРГЕЙ', 'МАРИНА', 'ПАВЕЛ',
        'СЛЕДЫ', 'УЛИКА', 'МОТИВ', 'АЛИБИ',
        'ВЕРЁВКА', 'КИНЖАЛ',
        'СЦЕНА', 'ГРИМЁРКА'
      ],
      absent_words: {
        killer: 'АНТОН',
        method: 'ЯБЛОКО'
      },
      location_answer: 'ПОДВАЛ'
    }
  },
  {
    title: 'Убийство на вилле',
    case_number: 3,
    difficulty: 'medium',
    is_free: false,
    puzzle_data: {
      words_in_grid: [
        'ДМИТРИЙ', 'ЕЛЕНА', 'РОМАН',
        'СЛЕДЫ', 'УЛИКА', 'МОТИВ', 'АЛИБИ',
        'ПИСТОЛЕТ', 'ВЕРЁВКА',
        'КУХНЯ', 'ТЕРРАСА'
      ],
      absent_words: {
        killer: 'ИРИНА',
        method: 'ОТРАВА'
      },
      location_answer: 'ПОДВАЛ'
    }
  },
];

async function seed() {
  for (const c of cases) {
    await pool.query(`
      INSERT INTO cases (title, case_number, difficulty, is_free, puzzle_data, published_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (case_number) DO UPDATE SET
        title       = EXCLUDED.title,
        difficulty  = EXCLUDED.difficulty,
        is_free     = EXCLUDED.is_free,
        puzzle_data = EXCLUDED.puzzle_data,
        published_at = NOW()
    `, [c.title, c.case_number, c.difficulty, c.is_free, JSON.stringify(c.puzzle_data)]);
    console.log(`✅ Дело №${c.case_number} — ${c.title}`);
  }
  console.log('🎉 Все дела добавлены!');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
