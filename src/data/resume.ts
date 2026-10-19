// Single source for /resume (screen + print-to-PDF).

export const resume = {
	name: 'Avishek Chakraborty',
	handle: 'notDeadCaller',
	headline: 'Cybersecurity undergrad · Founding Security Engineer at Opzami',
	location: 'Kolkata, India',
	links: [
		{ label: 'avishek_chakraborty10@yahoo.com', href: 'mailto:avishek_chakraborty10@yahoo.com' },
		{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/avishekwithav/' },
		{ label: 'GitHub', href: 'https://github.com/notDeadCaller' },
	],
	summary:
		'Breaking systems in competitions, encrypting them in code. Cybersecurity undergrad with a weekend CTF habit, a post-quantum obsession, and an eye for what breaks next.',
	experience: [
		{
			role: 'Founding Security Engineer',
			org: 'Techtel Ideas Pvt. Ltd. (Opzami)',
			period: 'May 2026 – Present',
			points: [
				'Own security and payments for Opzami, a pre-launch AI B2B SaaS startup.',
				'Fixed broken JWT verification, SSRF, BOLA, unauthenticated endpoints and Supabase RLS gaps.',
				'Traced an 8.1× billing overcharge, corrected the cost model and built billing on Dodo Payments.',
				'Chained four independently logged findings into one proven path, from public sign-up to SSRF to AWS task-role credentials to a plaintext database key that bypassed all RLS, then fixed the chain.',
			],
		},
		{
			role: 'Paid Intern',
			org: 'Vedantu Innovations Pvt. Ltd. (Remote)',
			period: 'Aug 2023 – May 2024',
			points: [
				'Researched and scripted 50+ YouTube Shorts on STEM concepts, competitive exam prep and college guidance.',
				'Owned end-to-end production over a 9-month engagement, driving 26% growth in channel Shorts viewership.',
			],
		},
	],
	training: [
		{
			title: 'Familiarization Workshop on Quantum Computing',
			org: 'IISc Bangalore, Foundation for QC Innovation',
			period: 'Feb 2026',
			points: ['Week-long workshop on quantum circuits, quantum algorithm development and models of qubit realization.'],
		},
		{
			title: 'Mastercard Cybersecurity Virtual Job Simulation',
			org: 'Forage',
			period: 'Apr 2026',
			points: ['Analysed phishing email samples, identified structural and linguistic indicators, and proposed updates.'],
		},
	],
	achievements: [
		{ place: '1st', event: 'Sudo Override 2026, Jeopardy CTF', where: 'NJACK, IIT Patna' },
		{ place: '2nd', event: 'Cyber Quest 2026, Jeopardy CTF', where: 'HIT Kolkata' },
		{ place: '58th / 300', event: 'JerseyCTF VI (Open track)', where: 'NJIT, New Jersey' },
		{ place: '1st & 2nd', event: "Ideathon and Designathon, Promoteo'26", where: 'IIT Jodhpur' },
		{ place: '4th', event: 'Hack the Quiz: Cyber Challenge 2026', where: 'Anna University, Chennai' },
		{ place: '68 / 3000', event: 'HPE Codewars 2025', where: 'Codingal' },
		{ place: 'Top Writers', event: 'InkYourStory 2026', where: 'Readice Publication' },
	],
	skills: [
		{ group: 'Languages', items: ['Java', 'C', 'Python', 'Kotlin', 'SQL'] },
		{
			group: 'Security',
			items: ['Web exploitation', 'OWASP Top 10', 'Network security', 'BadUSB attack vectors', 'Bash scripting'],
		},
		{
			group: 'Tools',
			items: ['Ghidra', 'Burp Suite', 'Wireshark', 'OSINT', 'PowerShell ISE', 'Android Studio', 'GitHub', 'Dodo Payments'],
		},
		{
			group: 'Cloud & backend',
			items: ['AWS (ECS, S3, IAM, ECR)', 'FastAPI', 'Next.js', 'PostgreSQL', 'Supabase RLS', 'GitHub Actions'],
		},
		{ group: 'Research & writing', items: ['Technical research', 'Academic content writing', 'Scientific poster design'] },
		{ group: 'Spoken', items: ['Bangla (native)', 'English (C2, EF SET)', 'Hindi (fluent)'] },
	],
	education: [
		{
			title: 'B.Tech in Computer Science and Engineering',
			org: 'Heritage Institute of Technology, Kolkata',
			period: 'Aug 2024 – Jun 2028',
			points: ['Specialization in IoT and Cybersecurity', 'Latest YGPA: 8.95'],
		},
		{
			title: 'High School (ICSE, ISC)',
			org: 'Salt Lake School, Kolkata',
			period: '2010 – 2024',
			points: ['ICSE (class 10): 95.4%', 'ISC (class 12): 90.5%'],
		},
	],
};
