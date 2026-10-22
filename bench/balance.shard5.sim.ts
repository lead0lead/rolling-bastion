import { it } from 'vitest';
import { runBalanceShard } from './balance';

it('balance shard 5', () => runBalanceShard(4));
