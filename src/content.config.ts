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
	// a plain-spoken "if you read nothing else" summary, shown in a box at the top of the post
	tldr: z.string().optional(),
	// cover motif: eye | lattice | pulse | counter | flag | glyph:<any symbol or word>; omitted = seeded pattern
	art: z.string().optional(),
});

const writeups = defineCollection({
	loader: glob({ base: './src/content/writeups', pattern: '**/*.{md,mdx}' }),
	// `summary` renders as the key/value box at the top of a writeup: target, platform, difficulty, severity...
	schema: post.extend({
		summary: z.record(z.string(), z.string()).optional(),
		// CTF solves get a challenge card; `flag` stays hidden until the reader reveals it
		ctf: z
			.object({
				event: z.string(),
				challenge: z.string().optional(),
				category: z.string(),
				points: z.number().optional(),
				solves: z.number().optional(),
				difficulty: z.enum(['easy', 'medium', 'hard', 'insane']).optional(),
				result: z.string().optional(),
				flag: z.string().optional(),
			})
			.optional(),
	}),
});

const notes = defineCollection({
	loader: glob({ base: './src/content/notes', pattern: '**/*.{md,mdx}' }),
	// maturity drives the planet's size/brightness on the Notes map (seedling -> evergreen)
	schema: post.extend({ maturity: z.enum(['seedling', 'budding', 'evergreen']).default('seedling') }),
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
		/** my favourite: a highlighted card in project lists */
		favourite: z.boolean().default(false),
		order: z.number().default(0),
		art: z.string().optional(),
		// dated build log, rendered as a timeline on the project page
		log: z
			.array(z.object({ date: z.coerce.date(), title: z.string(), items: z.array(z.string()).default([]) }))
			.default([]),
	}),
});

export const collections = { writeups, notes, projects };
