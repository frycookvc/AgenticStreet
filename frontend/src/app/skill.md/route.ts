import { readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const filePath = join(process.cwd(), '..', 'skill', 'SKILL.md');
    const content = readFileSync(filePath);
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch {
    return new NextResponse('SKILL.md not found', { status: 404 });
  }
}
