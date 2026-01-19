/**
 * Blacklist of known bot DIDs that should not count toward discussion metrics
 * These are accounts with 100+ paper mentions - almost certainly bots
 */

export const BOT_BLACKLIST: Set<string> = new Set([
  // High-volume paper bots (100+ mentions)
  'did:plc:bxpaash7iceqjiur5bt7xntr', // biorxivpreprint.bsky.social - 2079 mentions
  'did:plc:32r7scd5hucgv552zjfuaigc', // astroarxiv.bsky.social - 1686 mentions
  'did:plc:traxg4jscmm3n3usqi76dsk2', // cscv-bot.bsky.social - 1226 mentions
  'did:plc:3mbqqo3dxddhl7nwqmghsn6a', // cslg-bot.bsky.social - 1109 mentions
  'did:plc:qw6djsufo4wezhpoqrrmpdek', // rridrobot.bsky.social - 1093 mentions
  'did:plc:3ow3lp7x5clt4w4le5zhvedx', // phypapers.bsky.social - 1038 mentions
  'did:plc:6kndbdnawzpis5y33gpacfop', // cscl-bot.bsky.social - 985 mentions
  'did:plc:uxjdkwlgj5ptelt2x4e3zrzr', // krxiv-cond-mat.bsky.social - 878 mentions
  'did:plc:fvxadjtvukbhdaslbiih3r2p', // arxiv-cs-cv.bsky.social - 819 mentions
  'did:plc:s42g7pgvrcqcbpk4mkqp64oh', // krxiv-astro-ph.bsky.social - 807 mentions
  'did:plc:gpfuvbrmlo4vb5wdv3jy3hpn', // medrxivpreprint.bsky.social - 673 mentions
  'did:plc:melooq3pgxglmzuttf2wr5es', // quantph-bot.bsky.social - 628 mentions
  'did:plc:lc6hdhnjkgccd6ysi7e23pll', // bigearthdata.bsky.social - 628 mentions
  'did:plc:df4dbsajjtvbbjn5poliesvs', // csai-bot.bsky.social - 595 mentions
  'did:plc:jf3oraummcsfodflx5w5pouf', // arxiv-cs-cl.bsky.social - 572 mentions
  'did:plc:kat7wkkgmmdffwp7bnbee7he', // krxiv-quant-ph.bsky.social - 557 mentions
  'did:plc:pxokkpd3cyvbwgdwampv3soq', // optb0t.bsky.social - 475 mentions
  'did:plc:igqxxdun347dblo3n7xwq6ur', // arxiv-quant-ph.bsky.social - 422 mentions
  'did:plc:x5rv6tsxd5x3zyugh4v6rd5z', // 391 mentions
  'did:plc:abewb25a65arvstxcqns624d', // biorxiv-neursci.bsky.social - 361 mentions
  'did:plc:npq7o2en235kjxtvwp6lhfr2', // condmatmtrlsci-bot.bsky.social - 316 mentions
  'did:plc:mifotl2wwtvynpw7s5xjkgg2', // cscr-bot.bsky.social - 311 mentions
  'did:plc:mb4h2fb32okk4ka4py3yqwli', // csro-bot.bsky.social - 308 mentions
  'did:plc:l6slahu5lfsw5yae67rc6xxx', // hepph-bot.bsky.social - 277 mentions
  'did:plc:y7cmacgqwwrfv33ut7672uhr', // ai10bro.bsky.social - 244 mentions
  'did:plc:rz7fyco5t6aby5mnk3i45a4g', // mathco-bot.bsky.social - 241 mentions
  'did:plc:2zbkouq2pbdnie6qz255naiv', // hepth-bot.bsky.social - 241 mentions
  'did:plc:ltcb3xvqhbgteuq7flui3dqn', // grqc-bot.bsky.social - 241 mentions
  'did:plc:kc77nd6ebyctklgql72f2ok3', // krxiv-hep-ph.bsky.social - 233 mentions
  'did:plc:7z3ydrypm3vp2y42gbybtvgo', // csit-bot.bsky.social - 231 mentions
  'did:plc:vjqb6serdr54lcd735od4xwx', // 229 mentions
  'did:plc:lfjzhscway3jyqjv67hfy7iv', // 224 mentions
  'did:plc:joj2wp43ajdu7st22gmpglyl', // 222 mentions
  'did:plc:nzlt4cxdaltj3hyviipywiz6', // 217 mentions
  'did:plc:okewrzdx63hkw5fuwqzsenxu', // 215 mentions
  'did:plc:tvn6l2dnwmb4k74omv4tvmtf', // 208 mentions
  'did:plc:yuddzjl72zo6bkns2anpbqha', // 208 mentions
  'did:plc:ldhmrwmfy3ufsozxlqpjph5d', // 205 mentions
  'did:plc:klxhs3vhldlfr5r2hc6tsgc6', // 204 mentions
  'did:plc:l3vzphshhms2i3mly4ypjasn', // 203 mentions
  'did:plc:zvdk7qjbc7hemapgs3iddjd3', // 202 mentions
  'did:plc:iidfr4ee72rynh4277xftz4d', // 196 mentions
  'did:plc:qbej4rc7ffryrgzimbc55i2r', // 192 mentions
  'did:plc:6jizq42kw4tajfqeuunoqbnq', // 190 mentions
  'did:plc:35q7ogcn26kg6sysizyktg76', // 186 mentions
  'did:plc:m6ifothzi2l5qspld3eyvq2g', // 184 mentions
  'did:plc:yozobz2yauleyaqudmwgtkwc', // 182 mentions
  'did:plc:oadqndcydrletigu6swzdwzh', // 180 mentions
  'did:plc:6sj4dziign4onyvnnvayo4d2', // 176 mentions
  'did:plc:kpbc72v5g6gokoc26haqn2im', // 176 mentions
  'did:plc:5hywp76nymnu5yjn6y3xwqr3', // 170 mentions
  'did:plc:e24menxr3lkdypnilvelu45b', // 170 mentions
  'did:plc:7iqfj56czqkjuximqgjwpgym', // 170 mentions
  'did:plc:ozkvd6djihrjmimal56dve6w', // 165 mentions
  'did:plc:hfwnvjetns4fjrzbhc4zche2', // 164 mentions
  'did:plc:3atab2tvgmruv2wrvbddwutz', // 162 mentions
  'did:plc:r6fkqeqhyuhq3nyeqdh5dgnr', // 159 mentions
  'did:plc:mff4rin6m2amiiy6fsqgy6mj', // 156 mentions
  'did:plc:sv5gqyzhyklsu57n64ytnabq', // 156 mentions
  'did:plc:rkz3x7feswecafy74wpmea7f', // 155 mentions
  'did:plc:ukfr73piivinx5ljl4avafg4', // 151 mentions
  'did:plc:yth52bj3ujszh2ynota7ogmu', // 148 mentions
  'did:plc:nrfqk6t446qme4kb7aiemqig', // 145 mentions
  'did:plc:xmqi6wzwwkviamfa32v2x5mm', // 143 mentions
  'did:plc:d7bntg63yclrkb74scxe4hu6', // 140 mentions
  'did:plc:hstlmjpi2wbha6iws7d2pgf3', // 139 mentions
  'did:plc:bgcihsmdyqgh5vtylqrp2ile', // 138 mentions
  'did:plc:atqzwnyldfdj47r6c2sc3z5a', // 137 mentions
  'did:plc:rqzqrpmgvpdidh5557pbmyrw', // 136 mentions
  'did:plc:xh7clgho2tv6ysd6vcypiabf', // 134 mentions
  'did:plc:5t22gujzynxqoglssi6g3inf', // 134 mentions
  'did:plc:o6ggjvnj4ze3mnrpnv5oravg', // 132 mentions
  'did:plc:oylj75rpqsprvgsprzm5t3cf', // 129 mentions
  'did:plc:k4nz5edhmpdqzsmsblvjquor', // 129 mentions
  'did:plc:w2f5zvxf3rpydrqbwzfwscfs', // 126 mentions
  'did:plc:cwtda6vaktkwhmc7wwlnqlkg', // 124 mentions
  'did:plc:vdysbadz2lgiunw5wvxcggsp', // 119 mentions
  'did:plc:hszm4v36ocwl4hdtlak7ikyx', // 118 mentions
  'did:plc:2wzdd66tk3disiczlloxi5wx', // 116 mentions
  'did:plc:dmnxczsx5w7adk4l457rikrm', // 116 mentions
  'did:plc:4u3fuviop3otgzydoj4cvouf', // 116 mentions
  'did:plc:ebc7vqvpays45qkcjptcr5ta', // 116 mentions
  'did:plc:56p5hqta5tnz25tucrnszplh', // 114 mentions
  'did:plc:g3njqfqlsjf2cdvcqdssnf3r', // 113 mentions
  'did:plc:foygkkn4lwxidvehcpwlu67d', // 112 mentions
  'did:plc:vvhlcsj2kue7tnl3jxfxsdxs', // 111 mentions
  'did:plc:iibjotpthl7qlaekr6326lna', // 110 mentions
  'did:plc:i4ckjej3ksc3axccdfb7y2ht', // 110 mentions
  'did:plc:2oq3uyck4mdkt3ayzar347w6', // 109 mentions
  'did:plc:4tq4d3hyget273pkc66qjnqu', // 108 mentions
  'did:plc:ohxxgnxadh5qous6fqessrir', // 105 mentions
  'did:plc:fqe6f5tovyh2wpxc2l5m4szm', // 104 mentions
  'did:plc:4rgrdigiftglskeax4wvmsev', // 104 mentions
  'did:plc:sth6y6ewobihdegnuw77ahap', // 103 mentions
  'did:plc:fr5pvnsri3v2oplch3nd43n3', // 100 mentions
]);

/**
 * Check if a DID belongs to a known bot
 */
export function isBot(did: string): boolean {
  return BOT_BLACKLIST.has(did);
}
