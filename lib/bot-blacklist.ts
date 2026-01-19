/**
 * Blacklist of known bot DIDs that should not count toward discussion metrics
 * Add bot DIDs here to exclude them from mention counts
 */

export const BOT_BLACKLIST: Set<string> = new Set([
  // Preprint/arxiv bots
  'did:plc:bxpaash7iceqjiur5bt7xntr', // biorxivpreprint.bsky.social
  'did:plc:32r7scd5hucgv552zjfuaigc', // astroarxiv.bsky.social
  'did:plc:traxg4jscmm3n3usqi76dsk2', // cscv-bot.bsky.social
  'did:plc:3mbqqo3dxddhl7nwqmghsn6a', // cslg-bot.bsky.social
  'did:plc:qw6djsufo4wezhpoqrrmpdek', // rridrobot.bsky.social
  'did:plc:3ow3lp7x5clt4w4le5zhvedx', // phypapers.bsky.social
  'did:plc:6kndbdnawzpis5y33gpacfop', // cscl-bot.bsky.social
  'did:plc:uxjdkwlgj5ptelt2x4e3zrzr', // krxiv-cond-mat.bsky.social
  'did:plc:fvxadjtvukbhdaslbiih3r2p', // arxiv-cs-cv.bsky.social
  'did:plc:s42g7pgvrcqcbpk4mkqp64oh', // krxiv-astro-ph.bsky.social
  'did:plc:gpfuvbrmlo4vb5wdv3jy3hpn', // medrxivpreprint.bsky.social
  'did:plc:lc6hdhnjkgccd6ysi7e23pll', // bigearthdata.bsky.social
  'did:plc:melooq3pgxglmzuttf2wr5es', // quantph-bot.bsky.social
  'did:plc:df4dbsajjtvbbjn5poliesvs', // csai-bot.bsky.social
  'did:plc:jf3oraummcsfodflx5w5pouf', // arxiv-cs-cl.bsky.social
  'did:plc:kat7wkkgmmdffwp7bnbee7he', // krxiv-quant-ph.bsky.social
  'did:plc:pxokkpd3cyvbwgdwampv3soq', // optb0t.bsky.social
  'did:plc:igqxxdun347dblo3n7xwq6ur', // arxiv-quant-ph.bsky.social
  'did:plc:abewb25a65arvstxcqns624d', // biorxiv-neursci.bsky.social
]);

/**
 * Check if a DID belongs to a known bot
 */
export function isBot(did: string): boolean {
  return BOT_BLACKLIST.has(did);
}
