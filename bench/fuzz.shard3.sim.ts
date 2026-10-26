import { it } from 'vitest';
import { runFuzzShard } from './fuzz';

it('fuzz shard 3', () => runFuzzShard(2));
