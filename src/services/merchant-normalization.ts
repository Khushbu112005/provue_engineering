/**
 * Merchant Normalization Pipeline
 * 1. Raw Merchant (stored unchanged)
 * 2. Normalized Merchant (uppercase, remove special characters, remove transaction markers)
 * 3. Merchant Family (remove location suffixes)
 * 4. Canonical Merchant (similarity clustering)
 */

export function normalizeMerchant(raw: string): string {
  if (!raw) return "UNKNOWN";
  
  // Convert to uppercase & trim
  let str = raw.toUpperCase().trim();
  
  // Remove special characters (except spaces)
  str = str.replace(/[^A-Z0-9\s]/g, " ");
  
  // Remove transaction markers / noise terms
  const markers = [
    "ORDER", "TRIP", "BOOKING", "PAYMENT", "BILL", "TRANSFER", 
    "SELF", "ONLINE", "LTD", "PVT", "SYSTEMS", "SERVICES",
    "LIMITED", "PRIVATE", "CORP", "CO", "COM", "IN", "NET", "ORG"
  ];
  
  // Split into words and filter out markers
  const words = str.split(/\s+/).filter(w => w.length > 0 && !markers.includes(w));
  
  return words.join(" ").trim() || "UNKNOWN";
}

export function getMerchantFamily(normalized: string): string {
  // Remove common location suffixes
  const locations = [
    "MUMBAI", "BANGALORE", "BENGALURU", "DELHI", "NEW DELHI", 
    "PUNE", "CHENNAI", "HYDERABAD", "KOLKATA", "GURGAON", "NOIDA",
    "AHMEDABAD", "JAIPUR", "INDIA", "OFFICE", "STORE", "MALL", "AIRPORT"
  ];
  
  const words = normalized.split(/\s+/).filter(w => !locations.includes(w));
  return words.join(" ").trim() || normalized;
}

// Jaro-Winkler Similarity
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  
  const matchWindow = Math.max(1, Math.floor(Math.max(len1, len2) / 2) - 1);
  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);
  
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(len2 - 1, i + matchWindow);
    for (let j = start; j <= end; j++) {
      if (!matches2[j] && s1[i] === s2[j]) {
        matches1[i] = true;
        matches2[j] = true;
        matches++;
        break;
      }
    }
  }
  
  if (matches === 0) return 0.0;
  
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
  }
  
  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0;
  
  // Prefix matching
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) {
      prefix++;
    } else {
      break;
    }
  }
  
  return jaro + prefix * 0.1 * (1.0 - jaro);
}

export function buildCanonicalMapping(rawMerchants: string[]): Record<string, { normalized: string; family: string; canonical: string }> {
  const mapping: Record<string, { normalized: string; family: string; canonical: string }> = {};
  
  // Get unique raw merchants
  const uniqueRaw = Array.from(new Set(rawMerchants));
  
  // Pre-normalize and find families
  const normalizedMap = uniqueRaw.map(raw => {
    const norm = normalizeMerchant(raw);
    const fam = getMerchantFamily(norm);
    return { raw, norm, fam };
  });
  
  // Sort families by length ascending, so shorter terms (usually the base brand name) become heads
  const sortedFamilies = Array.from(new Set(normalizedMap.map(x => x.fam))).sort((a, b) => a.length - b.length);
  
  const clusters: string[][] = [];
  
  for (const fam of sortedFamilies) {
    let clustered = false;
    for (const cluster of clusters) {
      const head = cluster[0];
      
      // Heuristic 1: Substring / Prefix match (e.g. SWIGGY is prefix of SWIGGY INSTAMART)
      if (fam.startsWith(head) && head.length >= 4) {
        cluster.push(fam);
        clustered = true;
        break;
      }
      
      // Heuristic 2: Jaro-Winkler similarity
      const sim = jaroWinkler(fam, head);
      if (sim >= 0.85) {
        cluster.push(fam);
        clustered = true;
        break;
      }
    }
    
    if (!clustered) {
      clusters.push([fam]);
    }
  }
  
  // Map family to canonical head
  const familyToCanonical: Record<string, string> = {};
  for (const cluster of clusters) {
    const canonical = cluster[0]; // The shortest string in the cluster is the canonical brand
    for (const member of cluster) {
      familyToCanonical[member] = canonical;
    }
  }
  
  // Map raw merchants to details
  for (const item of normalizedMap) {
    const canonical = familyToCanonical[item.fam] || item.fam;
    mapping[item.raw] = {
      normalized: item.norm,
      family: item.fam,
      canonical
    };
  }
  
  return mapping;
}
