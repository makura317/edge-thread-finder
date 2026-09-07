export const TAG_RULES = [
  { type: '種別', value: '実況', patterns: [/実況/, /NHKBS/i, /★\d+$/] },
  { type: '競技', value: '野球', patterns: [/野球/, /打線/, /投手/, /満塁/, /四球/, /ホームラン/] },
  { type: 'リーグ', value: 'MLB', patterns: [/\bMLB\b/i, /メジャー/, /ドジャース/, /ナショナルズ/] },
  { type: '球団', value: 'ドジャース', patterns: [/\bLAD\b/i, /ドジャース/] },
  { type: '球団', value: 'ナショナルズ', patterns: [/\bWSH\b/i, /ナショナルズ/] },
  { type: '選手', value: '大谷翔平', patterns: [/大谷/, /翔平/] },
  { type: '選手', value: 'ボビー・ミラー', patterns: [/ボビー[・ー]?ミラー/, /ミラー/] },
  { type: '人物', value: 'デーブ・ロバーツ', patterns: [/ロバーツ/] },
];

const normalize = value => value.normalize('NFKC');

export function dictionaryCandidates({ title, body }) {
  const titleText = normalize(title || '');
  const bodyText = normalize(body || '');
  return TAG_RULES.flatMap(rule => {
    const titleMatches = rule.patterns.reduce((total, pattern) => total + (titleText.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))?.length || 0), 0);
    const bodyMatches = rule.patterns.reduce((total, pattern) => total + (bodyText.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))?.length || 0), 0);
    if (!titleMatches && !bodyMatches) return [];
    return [{ type: rule.type, value: rule.value, confidence: titleMatches ? 0.99 : Math.min(0.94, 0.55 + bodyMatches * 0.1), evidence: { titleMatches, bodyMatches }, source: 'dictionary' }];
  });
}

// The archive API returns this compact shape.  Keep the candidate metadata so
// the UI can make it clear that these are inexpensive, dictionary-based tags
// rather than a Luna judgement.
export function dictionaryTags(thread) {
  return dictionaryCandidates(thread).map(({ type, value, confidence, source }) => ({
    type,
    value,
    confidence,
    source
  }));
}

export const taggingSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tags', 'summary'],
  properties: {
    summary: { type: 'string', maxLength: 180 },
    tags: {
      type: 'array', maxItems: 12,
      items: {
        type: 'object', additionalProperties: false,
        required: ['type', 'value', 'decision', 'confidence', 'reason'],
        properties: {
          type: { type: 'string', maxLength: 24 },
          value: { type: 'string', maxLength: 64 },
          decision: { type: 'string', enum: ['keep', 'add', 'drop'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { type: 'string', maxLength: 160 }
        }
      }
    }
  }
};

export function createTaggingRequest({ title, body, candidates, model = 'gpt-5.6-luna' }) {
  const clippedBody = (body || '').slice(0, 50_000);
  return {
    model,
    reasoning: { effort: 'low' },
    input: [
      { role: 'developer', content: 'あなたは日本語の匿名掲示板ログを整理する編集者です。候補タグを文脈で精査してください。候補が主題でなければdropにし、根拠のない固有名詞を追加しないでください。タグは実況、競技、リーグ、球団、選手、人物、話題のような短い分類にします。出力は指定JSONのみです。' },
      { role: 'user', content: JSON.stringify({ title, body: clippedBody, dictionaryCandidates: candidates }) }
    ],
    text: { format: { type: 'json_schema', name: 'thread_tags', strict: true, schema: taggingSchema } }
  };
}

export function readResponseJson(response) {
  const text = response.output_text || response.output?.flatMap(item => item.content || []).find(content => content.type === 'output_text')?.text;
  if (!text) throw new Error('モデルからタグJSONを取得できませんでした。');
  return JSON.parse(text);
}
