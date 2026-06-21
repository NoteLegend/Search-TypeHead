// 32-bit FNV-1a Hash Function
export function hashFNV1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Multiply by 32-bit FNV prime 16777619
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

interface RingNode {
  hash: number;
  physicalNode: string;
}

export class ConsistentHashRing {
  private ring: RingNode[] = [];
  private physicalNodes: Set<string> = new Set();
  private vNodeCount: number;

  constructor(nodes: string[] = [], vNodeCount: number = 150) {
    this.vNodeCount = vNodeCount;
    for (const node of nodes) {
      this.addNode(node);
    }
  }

  // Add a physical node to the ring with its virtual nodes
  addNode(node: string) {
    if (this.physicalNodes.has(node)) return;

    this.physicalNodes.add(node);
    for (let i = 0; i < this.vNodeCount; i++) {
      const vNodeName = `${node}#vnode-${i}`;
      const hash = hashFNV1a(vNodeName);
      this.ring.push({ hash, physicalNode: node });
    }

    // Keep the ring sorted by hash for binary search
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  // Remove a physical node from the ring
  removeNode(node: string) {
    if (!this.physicalNodes.has(node)) return;

    this.physicalNodes.delete(node);
    this.ring = this.ring.filter(rn => rn.physicalNode !== node);
  }

  // Retrieve the physical node responsible for a given key
  getNode(key: string): string {
    if (this.ring.length === 0) {
      throw new Error('Consistent Hash Ring is empty');
    }

    const keyHash = hashFNV1a(key);
    
    // Binary search on the sorted ring array
    let low = 0;
    let high = this.ring.length - 1;
    let idx = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.ring[mid].hash >= keyHash) {
        idx = mid;
        high = mid - 1; // Try to find a smaller hash that is still >= keyHash
      } else {
        low = mid + 1;
      }
    }

    // Wrap around to 0 if the keyHash is greater than all hashes on the ring
    if (low >= this.ring.length) {
      idx = 0;
    }

    return this.ring[idx].physicalNode;
  }

  getRingInfo() {
    return this.ring.map(rn => ({ hash: rn.hash, node: rn.physicalNode }));
  }
}
