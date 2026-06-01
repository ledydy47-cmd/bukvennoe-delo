import pool from './db.js';
import dotenv from 'dotenv';
dotenv.config();

const SIZE = 10;
const DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
const RU_FILL = 'АБВГДЖЗИКЛМНПРСТУФХЦЧШЩЫЭЮЯ';

function shuffle(a) {
  const b = [...a];
  for (let i=b.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; }
  return b;
}
function makeEmpty() { return Array.from({length:SIZE},()=>Array(SIZE).fill(null)); }
function canPlace(g,word,r,c,dr,dc) {
  for(let i=0;i<word.length;i++){
    const nr=r+dr*i,nc=c+dc*i;
    if(nr<0||nr>=SIZE||nc<0||nc>=SIZE) return false;
    if(g[nr][nc]!==null&&g[nr][nc]!==word[i]) return false;
  }
  return true;
}
function doPlace(g,word,r,c,dr,dc) {
  const cells=[];
  for(let i=0;i<word.length;i++){ g[r+dr*i][c+dc*i]=word[i]; cells.push([r+dr*i,c+dc*i]); }
  return cells;
}
function isLine(cells) {
  if(cells.length<=2) return false;
  const rows=cells.map(c=>c[0]),cols=cells.map(c=>c[1]);
  if(new Set(rows).size===1) return true;
  if(new Set(cols).size===1) return true;
  const drs=[],dcs=[];
  for(let i=1;i<cells.length;i++){ drs.push(cells[i][0]-cells[i-1][0]); dcs.push(cells[i][1]-cells[i-1][1]); }
  if(new Set(drs).size===1&&new Set(dcs).size===1) return true;
  return false;
}

function buildPuzzle(words_in_grid, location_answer) {
  for(let attempt=0;attempt<1000;attempt++){
    const g=makeEmpty();
    const placements=[];
    let ok=true;
    const words=shuffle(words_in_grid);
    for(const word of words){
      const options=[];
      for(let r=0;r<SIZE;r++)
        for(let c=0;c<SIZE;c++)
          for(const [dr,dc] of DIRS)
            if(canPlace(g,word,r,c,dr,dc))
              options.push({r,c,dr,dc});
      if(!options.length){ok=false;break;}
      const {r,c,dr,dc}=options[Math.floor(Math.random()*options.length)];
      placements.push({word,cells:doPlace(g,word,r,c,dr,dc)});
    }
    if(!ok) continue;

    const usedSet=new Set();
    placements.forEach(p=>p.cells.forEach(([r,c])=>usedSet.add(`${r},${c}`)));
    const free=[];
    for(let r=0;r<SIZE;r++)
      for(let c=0;c<SIZE;c++)
        if(!usedSet.has(`${r},${c}`)) free.push([r,c]);
    if(free.length<location_answer.length) continue;

    const freeSh=shuffle(free);
    let secretCells=freeSh.slice(0,location_answer.length);
    let tries=0;
    while(isLine(secretCells)&&tries<50){
      shuffle(freeSh); secretCells=freeSh.slice(0,location_answer.length); tries++;
    }
    if(isLine(secretCells)) continue;

    const locLetters=[...location_answer];
    secretCells.forEach(([r,c],i)=>g[r][c]=locLetters[i]);

    const safeFill=RU_FILL.split('').filter(ch=>![...location_answer].includes(ch));
    for(let r=0;r<SIZE;r++)
      for(let c=0;c<SIZE;c++)
        if(g[r][c]===null) g[r][c]=safeFill[Math.floor(Math.random()*safeFill.length)];

    return { grid: g, placements, secretCells };
  }
  return null;
}

const CASES = [
  {
    title: 'Смерть в особняке',
    case_number: 1,
    difficulty: 'easy',
    is_free: true,
    words_in_grid: ['НАТАША','БОРИС','АНДРЕЙ','СЛЕДЫ','УЛИКА','МОТИВ','АЛИБИ','КИНЖАЛ','ЯБЛОКО','ПОДВАЛ','ТЕРРАСА'],
    absent_words: { killer: 'ВИКТОР', method: 'ОТРАВА' },
    location_answer: 'БИБЛИОТЕКА',
  },
  {
    title: 'Тайна старого театра',
    case_number: 2,
    difficulty: 'easy',
    is_free: true,
    words_in_grid: ['СЕРГЕЙ','МАРИНА','ПАВЕЛ','СЛЕДЫ','УЛИКА','МОТИВ','АЛИБИ','ВЕРЁВКА','КИНЖАЛ','СЦЕНА','ГРИМЁРКА'],
    absent_words: { killer: 'АНТОН', method: 'ЯБЛОКО' },
    location_answer: 'ПОДВАЛ',
  },
  {
    title: 'Убийство на вилле',
    case_number: 3,
    difficulty: 'medium',
    is_free: false,
    words_in_grid: ['ДМИТРИЙ','ЕЛЕНА','РОМАН','СЛЕДЫ','УЛИКА','МОТИВ','АЛИБИ','ПИСТОЛЕТ','ВЕРЁВКА','КУХНЯ','ТЕРРАСА'],
    absent_words: { killer: 'ИРИНА', method: 'ОТРАВА' },
    location_answer: 'ПОДВАЛ',
  },
];

async function seed() {
  for (const c of CASES) {
    console.log(`⏳ Генерирую головоломку для дела №${c.case_number}...`);

    const puzzle = buildPuzzle(c.words_in_grid, c.location_answer);
    if (!puzzle) {
      console.error(`❌ Не удалось сгенерировать дело №${c.case_number}`);
      continue;
    }

    // Сохраняем всё — и конфиг и готовую сетку
    const puzzle_data = {
      words_in_grid:  c.words_in_grid,
      absent_words:   c.absent_words,
      location_answer: c.location_answer,
      // Готовая фиксированная сетка
      grid:           puzzle.grid,
      placements:     puzzle.placements,
      secret_cells:   puzzle.secretCells,
      // Фиксированный порядок слов для списка
      word_order:     shuffle([...c.words_in_grid, c.absent_words.killer, c.absent_words.method]),
    };

    await pool.query(`
      INSERT INTO cases (title, case_number, difficulty, is_free, puzzle_data, published_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (case_number) DO UPDATE SET
        title        = EXCLUDED.title,
        difficulty   = EXCLUDED.difficulty,
        is_free      = EXCLUDED.is_free,
        puzzle_data  = EXCLUDED.puzzle_data,
        published_at = NOW()
    `, [c.title, c.case_number, c.difficulty, c.is_free, JSON.stringify(puzzle_data)]);

    console.log(`✅ Дело №${c.case_number} — ${c.title}`);
  }
  console.log('🎉 Все дела добавлены!');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
