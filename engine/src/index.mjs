// 引擎公共 API。浏览器 SPA 与 Node/CI 共用同一套纯函数。
export { createSession } from './session.mjs';
export {
  resolveConfig,
  DEFAULT_CONFIG,
  FROZEN,
  PENDING_ARBITRATIONS,
  ConfigError,
} from './config.mjs';
export { settleConviction, UNRESOLVED_COPY } from './settle.mjs';
export { evaluateTrigger, INSUFFICIENT_MESSAGE } from './trigger.mjs';
export { classifySegment, presentationOrder } from './p12.mjs';
export { normalize } from './text.mjs';
export { buildLexicon, longestMatch, findOccurrences } from './matcher.mjs';
export { BEATS, DEEP_MOUNTS, DECISION_FORKS, PERCEPTION_WORDLISTS, ORDER_SIGNAL } from '../data/beats.mjs';
export { P12_DATA, P12_STEMS, P12_WORDLISTS, P12_ANCHORS } from '../data/p12.mjs';
