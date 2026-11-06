import {describe,it,expect} from 'vitest';
import {classifyChalkRow,planChalkSection,wrapChalkLine} from './chalkNotes';

const revision=`SOCIAL STUDIES MARKING GUIDE
1. Name the type of weather that provides solar energy.
Ans: Sunny weather.
2. State any one way planting grass controls soil erosion.
Accept any one:
Grass roots bind soil particles together.
Grass slows down surface runoff.
3. Give any reason for keeping records of family property.
To provide proof of ownership.
To prevent disputes over family property.`;

describe('PDF section to handwritten chalkboard',()=>{
  it('classifies headings, questions and answer labels without rewriting',()=>{
    expect(classifyChalkRow('SOCIAL STUDIES MARKING GUIDE',0)).toBe('heading');
    expect(classifyChalkRow('1. What is soil erosion?',2)).toBe('question');
    expect(classifyChalkRow('Accept any one:',2)).toBe('answer');
    expect(classifyChalkRow('Ans: Sunny weather.',2)).toBe('answer');
  });
  it('creates a 3-column revision board with real strokes',()=>{
    const chalk=planChalkSection(revision,3);
    expect(chalk.pages.length).toBeGreaterThan(0);
    expect(chalk.pages[0]!.columns).toBe(3);
    expect(chalk.pages[0]!.rows[0]!.original).toBe('SOCIAL STUDIES MARKING GUIDE');
    const all=chalk.pages.flatMap(p=>p.rows);
    expect(all).toHaveLength(revision.split('\n').length);
    expect(all.every(row=>row.plan.strokes.length>0)).toBe(true);
    expect(all.every(row=>row.y+row.height<=954)).toBe(true);
    expect(all.every(row=>row.x>=111&&row.x+row.width<=1812)).toBe(true);
    expect(all.find(row=>row.style==='answer')!.plan.strokes[0]!.color).toBe('#ead074');
  });
  it('shows an identical PDF heading once in the photographed board header',()=>{
    const title='SOCIAL STUDIES MARKING GUIDE';
    const p=planChalkSection(revision,3,1,title);
    expect(p.pages.flatMap(pg=>pg.rows).map(r=>r.original)).not.toContain(title);
    expect(p.pages.flatMap(pg=>pg.rows).map(r=>r.original).join('\n')).toContain('Sunny weather');
  });
  it('wraps long text at word boundaries without inserting letters',()=>{
    const line='A good citizen participates in community cleaning.';
    const wrapped=wrapChalkLine(line,390,34);
    expect(wrapped.split('\n').length).toBeGreaterThan(1);
    expect(wrapped.replace(/\n/g,' ')).toBe(line);
  });
  it('flows to a new page instead of squeezing tiny characters',()=>{
    const section=Array.from({length:26},(_,i)=>`${i+1}. Explain a prefect duty in class.`).join('\n');
    const chalk=planChalkSection(section,2);
    expect(chalk.pages.length).toBeGreaterThan(1);
    expect(chalk.pages.flatMap(p=>p.rows)).toHaveLength(26);
  });
  it('refuses to silently invent unsupported mathematical glyphs',()=>{
    expect(()=>planChalkSection('How does the symbol ∀ change the equation?',1))
      .toThrow(/unsupported chalk characters/);
  });
  it('rejects oversized sections and invalid layout settings',()=>{
    expect(()=>planChalkSection('x'.repeat(1601),2)).toThrow(/too long/);
    expect(()=>planChalkSection('Notes',0 as 1)).toThrow(/columns/);
  });
});
