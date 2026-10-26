import { it } from 'vitest';
import { runFuzzShard } from './fuzz';

it('fuzz shard 4', () => runFuzzShard(3));
