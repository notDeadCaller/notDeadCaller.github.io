// Tiny, injection-safe markdown for decrypted note bodies: blank-line paragraphs, `code` and
// **bold**. Everything is built from text nodes and a fixed set of elements (p / code / strong) —
// the decrypted text is NEVER parsed as HTML or assigned to innerHTML, so nothing it contains can
// inject markup or script, even if the ciphertext were swapped.
export function renderNote(text: string, el: HTMLElement): void {
	const doc = el.ownerDocument;
	el.replaceChildren();
	for (const para of text.split(/\n\s*\n/)) {
		if (!para.trim()) continue;
		const p = doc.createElement('p');
		const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
		let last = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(para))) {
			if (m.index > last) p.appendChild(doc.createTextNode(para.slice(last, m.index)));
			const tok = m[0];
			const node = doc.createElement(tok[0] === '`' ? 'code' : 'strong');
			node.textContent = tok[0] === '`' ? tok.slice(1, -1) : tok.slice(2, -2);
			p.appendChild(node);
			last = m.index + tok.length;
		}
		if (last < para.length) p.appendChild(doc.createTextNode(para.slice(last)));
		el.appendChild(p);
	}
}
