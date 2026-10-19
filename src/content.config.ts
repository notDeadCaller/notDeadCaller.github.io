import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const post = z.object({
	title: z.string(),
	description: z.string(),
	pubDate: z.coerce.date(),
	updatedDate: z.coerce.date().optional(),
	tags: z.array(z.string()).default([]),
	draft: z.boolean().default(false),
	// cover motif: eye | lattice | pulse | counter | glyph:<any symbol or word>; omitted = seeded pattern
	art: z.string().optional(),
});

const writeups = defineCollection({
	loader: glob({ base: './src/content/writeups', pattern: '**/*.{md,mdx}' }),
	// `summary` renders as the key/value box at the top of a writeup: target, platform, difficulty, severity...
	schema: post.extend({ summary: z.record(z.string(), z.string()).optional() }),
});

const notes = defineCollection({
	loader: glob({ base: './src/content/notes', pattern: '**/*.{md,mdx}' }),
	schema: post,
});

const projects = defineCollection({
	loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		year: z.number(),
		stack: z.array(z.string()).default([]),
		repo: z.url().optional(),
		link: z.url().optional(),
		status: z.enum(['active', 'shipped', 'archived', 'wip']).optional(),
		featured: z.boolean().default(false),
		order: z.number().default(0),
		art: z.string().optional(),
	}),
});

export const collections = { writeups, notes, projects };
