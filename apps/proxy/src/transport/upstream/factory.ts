// Upstream client factory (D-040 Phase A3).
//
// Single responsibility: given a config, return the right UpstreamClient.
// The pool imports this factory as its default; tests inject their own.

import type { UpstreamClient } from './interface.js';
import type { UpstreamServerConfig } from '../types.js';
import { HttpUpstreamClient } from './http.js';
import { StdioUpstreamClient } from './stdio.js';

export function createUpstreamClient(config: UpstreamServerConfig): UpstreamClient {
  switch (config.transport) {
    case 'http':  return new HttpUpstreamClient(config);
    case 'stdio': return new StdioUpstreamClient(config);
  }
}
