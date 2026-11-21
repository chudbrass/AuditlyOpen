import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeAllowedSpellingWord } from "@/lib/spelling";

const inputSchema = z.object({
  word: z.string().trim().min(2).max(100).regex(/^[\p{L}][\p{L}'’.-]*$/u, "Invalid spelling word"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id }, select: { allowedSpellingWords: true } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const word = normalizeAllowedSpellingWord(parsed.data.word);
  const allowedSpellingWords = [...new Set([...site.allowedSpellingWords, word])].sort();
  await prisma.site.update({ where: { id }, data: { allowedSpellingWords } });
  return NextResponse.json({ word, allowedSpellingWords });
}
