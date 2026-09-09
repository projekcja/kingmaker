/**
 * What each list actually was.
 *
 * The setup screen asks you to lead a party out of a real Knesset, and until
 * this file existed the only thing it could tell you about the choice was a
 * seat count and a bloc colour. Those are the two facts the game already uses;
 * they are not the reason anyone picks Rafi over Mapai.
 *
 * Keyed by party key rather than by chamber, because the keys are deliberately
 * reused — see {@link ./parties} — so Likud is `likud` in every chamber it
 * appears in and gets one entry here, not fourteen. That is also the constraint
 * on how these are written: a note has to be true of the list across every
 * election it contested, so it says what the party *was* rather than how this
 * particular night went. What happened on the night is the chamber's `outcome`,
 * and the two should not be made to say the same thing twice.
 *
 * Nothing in the engine reads this. It is not politics the auction can consult
 * — {@link ./types.standingRefusal} is the only thing that reads a party's
 * politics at all, and it reads the numbers, not the prose. This is flavour,
 * and it is allowed to be flavour.
 *
 * Coverage is every key in `parties.ts`; a test holds it that way, so a list
 * added to a chamber without a note here fails rather than quietly showing
 * nothing.
 */
export const PARTY_HISTORY: Record<string, string> = {
  // ── The founding party and its successors ────────────────────────────────
  mapai:
    "Ben-Gurion's party, and the state's governing party without a break from 1948 to 1968. Every prime minister for the first twenty years came out of it, and every coalition was assembled around it — the question at an election was never who would govern, only who they would govern with.",
  alignment:
    "The name Labor's bloc carried from 1965 to 1991, through successive mergers with Ahdut HaAvoda, Rafi and Mapam. It governed until 1977 and never won a clean victory again.",
  labor:
    "Mapai's direct successor from 1968: the party of the founding, of the Histadrut and of the kibbutzim. It has not led a government since Barak left office in 2001, and has spent most of the years since fighting for its own survival.",
  "one-israel":
    "Ehud Barak's 1999 vehicle — Labor running with Gesher and Meimad to reach beyond its own base. It won him the premiership by a wide margin and lasted a single, unhappy term.",
  "zionist-union":
    "Labor and Livni's Hatnua on one ticket in 2015, under Herzog and Livni as a declared rotation. Twenty-four seats, and the last time the centre-left was the main opposition bloc rather than one of several.",
  "labor-gesher":
    "Labor and Orly Levy-Abekasis's Gesher, paired in 2019 on a social and economic platform, at a point where neither could be confident of clearing the threshold alone.",
  "labor-gesher-meretz":
    "Labor, Gesher and Meretz forced onto one ticket in 2020 — the historic party of government and the party of the civil-rights left running together purely so the votes would not be wasted.",
  rafi:
    "Ben-Gurion's own split from Mapai in 1965, after the Lavon affair set him against the party he had built. Most of it went back into Labor in 1968; he did not.",
  "state-list":
    "The remnant of Rafi that refused to rejoin Labor in 1968, led by Dayan's allies. It went into Likud when the bloc was assembled in 1973.",
  "ahdut-haavoda":
    "The socialist-Zionist left that broke from Mapam in 1954 — further left than Mapai on the economy, and markedly more hawkish on borders. It merged into the Alignment in 1968.",
  mapam:
    "The Marxist Zionist left of the kibbutz movement, pro-Soviet well into the 1950s and the second largest party in the first Knesset. It spent most of its life just outside the government it kept voting with.",
  "am-ehad":
    "Amir Peretz's breakaway from Labor in 1999: a party of the Histadrut, campaigning on wages and pensions at a time when everyone else was campaigning on the peace process. It folded back in, and Peretz went on to lead Labor.",

  // ── The right ────────────────────────────────────────────────────────────
  herut:
    "Begin's party, the Irgun's political heir, and the one Ben-Gurion excluded by name — his standing formula for a coalition was everyone \"without Herut and Maki\". It was kept out of every government until 1967 and out of power until 1977.",
  gahal:
    "The 1965 bloc of Herut and the Liberals: Begin's first step out of the wilderness, and the arrangement that made him respectable enough to join the emergency government two years later. It became Likud in 1973.",
  likud:
    "Begin's 1973 bloc, which broke Labor's monopoly in 1977 and has held power for most of the years since. Under Netanyahu it governed continuously from 2009 to 2021, the longest run any party has managed since Mapai's.",
  "likud-beiteinu":
    "Likud and Yisrael Beiteinu on a single ticket in 2013. The joint list won eleven fewer seats than the two had held apart, and the merger was unwound within the year.",
  shlomtzion:
    "Ariel Sharon's own party in 1977, named for Queen Salome. Two seats, and he took it straight into Likud within weeks of the election.",
  "free-centre":
    "Shmuel Tamir's 1967 breakaway from Herut, on the argument that Begin was unelectable. It was one of the founding components of Likud six years later.",
  tehiya:
    "The hard right that split from Likud in 1979 over the peace treaty with Egypt and the evacuation of Sinai — the first party formed specifically to oppose giving up territory Israel held.",
  tzomet:
    "Rafael Eitan's party, founded 1983: the former chief of staff's blend of hard-line security, aggressive secularism and anti-corruption. Eight seats in 1992, and largely absorbed by Likud after.",
  moledet:
    "Rehavam Ze'evi's party, founded in 1988 on the open advocacy of \"transfer\" of the Arab population. Ze'evi was assassinated by the PFLP in 2001 while serving as a minister.",
  "national-union":
    "The right-wing bloc assembled and reassembled from 1999 onwards out of Moledet, Tehiya and their successors — the settlement right's answer to the threshold, rather than a party with a life of its own.",
  "nu-nrp":
    "The National Union and the National Religious Party on one ticket in 2006, run to stop the religious-Zionist vote splitting itself out of the Knesset.",
  urwp:
    "The Union of Right-Wing Parties, 2019: Habayit Hayehudi, the National Union and Otzma Yehudit pushed onto a single list by Netanyahu, who wanted no right-wing votes falling under the threshold.",
  ometz:
    "Yigael Hurvitz's one-seat economic list in 1984 — a former finance minister running on austerity while inflation ran at several hundred per cent. It joined the national unity government.",
  telem:
    "Moshe Dayan's last party, formed in 1981 after he left Begin's cabinet over autonomy for the territories. He died within months of the election and it did not outlive him.",
  kach:
    "Meir Kahane's party. One seat in 1984, and disqualified from the 1988 election as racist — the only list ever barred from an Israeli election and kept barred.",
  otzma:
    "Otzma Yehudit, Itamar Ben-Gvir's party and the acknowledged heir to Kahane's politics. It went from outside the Knesset to the national security ministry in the space of four years.",
  rz: "Religious Zionism, Bezalel Smotrich's list — the settlement right's own party, allied with Otzma Yehudit from 2021 and in government from 2022 with the finance ministry and a second post inside defence.",
  "new-hope":
    "Gideon Sa'ar's 2020 breakaway, formed after he challenged Netanyahu for the Likud leadership and lost. It ran on being the right without Netanyahu, which turned out to be a narrow constituency.",
  yamina:
    "Naftali Bennett's religious-right alliance, 2019 to 2021. Seven seats at its last election, and with them he became prime minister — the smallest party ever to supply one.",
  bennett:
    "Not a party that has run. A placeholder for the list Naftali Bennett is polling at the head of, in the one chamber here that is a projection rather than a result.",
  "yisrael-beiteinu":
    "Avigdor Lieberman's party, founded 1999 on the Russian-speaking vote and a secular, nationalist, anti-haredi platform. His resignation in 2018 and his refusals afterwards brought down a government and produced the deadlock that followed.",
  "yisrael-baaliyah":
    "Natan Sharansky's immigrants' party, 1996: seven seats built entirely on the million people who had arrived from the former Soviet Union. Absorbed into Likud in 2003.",

  // ── The liberal and centre traditions ────────────────────────────────────
  "general-zionists":
    "The bourgeois liberal centre of the first decade, and the main opposition to Mapai from the right on economics rather than on security. Merged into the Liberal Party in 1961.",
  progressives:
    "The liberal party of the Central European immigration — small, respectable, and a regular Mapai partner. It merged into the Liberal Party in 1961.",
  liberals:
    "The 1961 merger of the General Zionists and the Progressives, which four years later allied with Herut in Gahal and so carried Israeli liberalism into the right-wing bloc.",
  "independent-liberals":
    "The wing that walked out when the Liberals allied with Herut in 1965, unwilling to sit with Begin. It kept the old Progressive line and shrank steadily.",
  dash: "Yigael Yadin's Democratic Movement for Change, 1977: fifteen seats on electoral reform and cleaning up the state, almost all of them taken from Labor. It handed Begin the upset and then disintegrated inside two years.",
  shinui:
    "Twice a party. Amnon Rubinstein's 1974 reform list, and then Tommy Lapid's version, which took fifteen seats in 2003 on open hostility to the haredim and was wiped out completely at the next election.",
  "centre-party":
    "The 1999 vehicle for Yitzhak Mordechai, Amnon Lipkin-Shahak and Roni Milo — two generals and a mayor, running against Netanyahu on the strength of their CVs. Six seats, and gone by the next election.",
  "third-way":
    "Labor defectors who split in 1996 over the prospect of leaving the Golan Heights. Four seats, one term, and nothing after.",
  kadima:
    "Sharon's party, formed in 2005 when he left Likud to carry out the Gaza disengagement. It won the next two elections and was the largest list in 2009 without ever being able to form a government.",
  hatnua:
    "Tzipi Livni's party, founded in 2012 after she lost the Kadima leadership. Six seats, and with them the justice ministry and charge of the negotiations file.",
  kulanu:
    "Moshe Kahlon's 2015 party, running on the cost of living and the banks rather than on the conflict. Ten seats, the finance ministry, and back inside Likud by 2019.",
  "yesh-atid":
    "Yair Lapid's party, founded 2012 on the secular middle class, housing and the haredi draft. Nineteen seats at its first election, and in 2022 it made him prime minister for six months.",
  "blue-white":
    "Benny Gantz's 2019 alliance with Yesh Atid, built around three former chiefs of staff and the single proposition of beating Netanyahu. It fought three elections and broke apart when Gantz joined him in government instead.",
  "national-unity":
    "Benny Gantz's list with Gideon Sa'ar in 2022, and the vehicle through which he entered and later left the war cabinet.",
  gil: "The pensioners' party, and the surprise of 2006: seven seats, a large share of them protest votes from young secular voters who had never met a pensioner's issue. It vanished at the next election.",
  "flatto-sharon":
    "Shmuel Flatto-Sharon, a French financier facing extradition, who ran in 1977 essentially for the parliamentary immunity — and polled enough for two seats with no party behind him. He was later convicted of buying votes.",
  "haolam-hazeh":
    "Uri Avnery's 1965 list, run off the back of his muckraking magazine of the same name. The first time an Israeli journalist turned circulation directly into a seat.",
  fighters:
    "The Lehi veterans' list in 1949, led by Natan Yellin-Mor — one seat, won months after the group's members had been rounded up. It did not contest a second election.",

  // ── Religious and haredi ─────────────────────────────────────────────────
  urf: "The United Religious Front of 1949: all four religious parties on one ticket, from the Zionist Mizrachi to the anti-Zionist Agudat Yisrael. Sixteen seats, and the leverage that produced the status quo arrangements still in force.",
  mizrachi:
    "The religious-Zionist party founded in 1902 — the middle-class wing beside the movement's labour organisation, and a partner of Mapai's from the start.",
  "hapoel-hamizrachi":
    "The religious-Zionist workers' movement, and the larger half of what became the National Religious Party in 1956.",
  nrf: "The National Religious Front: Mizrachi and HaPoel HaMizrachi running as one in 1955, the year before they completed the merger and became the NRP.",
  nrp: "The National Religious Party, in almost every coalition from 1956 to 1992 as the moderate, dependable religious partner. The 1967 war changed what it was for, and it became the party of the settlements.",
  "habayit-hayehudi":
    "The NRP rebranded in 2008, and taken over in 2012 by Naftali Bennett, who moved it from three seats to twelve by aiming it at secular right-wing voters as well as religious ones.",
  "agudat-yisrael":
    "The Ashkenazi haredi party, founded in Poland in 1912 and opposed to Zionism before there was a state to be opposed to. It has sat in coalitions since 1949 while declining, on its rabbis' instructions, to accept a full ministry.",
  "poalei-agudat":
    "Agudat Yisrael's workers' wing, considerably more willing to deal with the state and its institutions than the parent movement was.",
  "torah-front":
    "Agudat Yisrael and Poalei Agudat Yisrael on a joint ticket in the early Knessets — the haredi world presenting one face to an electoral system it did not much believe in.",
  "degel-hatorah":
    "The Lithuanian yeshiva world's party, split off from Agudat Yisrael in 1988 by Rabbi Shach over who the haredi vote actually belonged to. It has run alongside Agudat Yisrael as UTJ almost ever since.",
  utj: "Agudat Yisrael and Degel HaTorah on one ticket since 1992 — hasidim and Lithuanians, two communities that agree on very little, held together by an electoral threshold neither could clear alone.",
  shas: "Founded in 1984 by Sephardi haredim shut out of the Ashkenazi yeshiva establishment, under Rabbi Ovadia Yosef. It has sat in governments of the left and of the right, and it is the most consistently pivotal party in the Knesset's history.",
  tami: "Aharon Abuhatzira's Sephardi traditionalist list in 1981, formed after he left the NRP. The direct forerunner of Shas, and a demonstration that the constituency was there.",
  morasha:
    "A short-lived 1984 religious ticket, joining Poalei Agudat Yisrael to hardliners from the NRP. It came apart before the next election.",
  yahad:
    "Ezer Weizman's centrist list in 1984 — the former air force commander and Likud defence minister running as a dove. Three seats, and he took them into the Alignment within months.",

  // ── The left, the communists, and the Arab parties ───────────────────────
  maki: "The Israeli Communist Party, and the other half of Ben-Gurion's exclusion formula. It split in 1965 over Zionism and the Arab question, the larger, Arab-majority wing leaving as Rakah.",
  rakah:
    "The anti-Zionist, Arab-majority wing of the 1965 communist split — for two decades the main political home of Arab citizens, and the core around which Hadash was later built.",
  hadash:
    "The front the communists founded in 1977: Jewish–Arab by design and by constitution, and the one Arab-led party that has never argued its case in national terms.",
  "hadash-taal":
    "Hadash running with Ahmad Tibi's Ta'al — the communist front and a secular nationalist who has spent his career being the most fluent Arab politician in the room.",
  ratz: "Shulamit Aloni's Civil Rights Movement, founded in 1973: the first Israeli party organised around rights rather than around territory, economics or religion. It went into Meretz in 1992.",
  moked:
    "A small list of the 1973 election, joining communists who had left Maki to peace-camp independents. It was folded into Shelli.",
  shelli:
    "The dovish left of 1977, a merger of Moked with the groups arguing for negotiations with the PLO years before that was a respectable position.",
  meretz:
    "The 1992 merger of Ratz, Mapam and Shinui: the secular civil-rights left, and Rabin's indispensable partner in the Oslo years. It fell out of the Knesset entirely in 2022.",
  "democratic-union":
    "Meretz, Ehud Barak's list and Stav Shaffir on one ticket in 2019 — an alliance assembled in weeks, for one election, to get over the threshold.",
  democrats:
    "The merged left: Meretz and Labor under Yair Golan, after an election in which one of them fell out of the Knesset and the other very nearly did.",
  plp: "The Progressive List for Peace, 1984: Muhammad Mi'ari and the retired general Mattityahu Peled running jointly, and campaigning openly for a Palestinian state before any Israeli party would.",
  adp: "The Arab Democratic Party, founded in 1988 by Abd el-Wahab Darawshe when he left Labor over the army's conduct in the First Intifada — an Arab party built by a defector from a Zionist one rather than out of the communist tradition.",
  ual: "The United Arab List, the Islamic Movement's electoral vehicle from 1996 and the ancestor of Ra'am — religiously conservative, and much less interested in the national question than its rivals.",
  "ual-taal": "The United Arab List running with Ahmad Tibi's Ta'al, one of the recurring pairings the threshold produces.",
  balad:
    "Azmi Bishara's party, founded 1995 on the demand that Israel become \"a state of all its citizens\". Bishara left the country in 2007 under investigation and has not returned.",
  "raam-balad":
    "Ra'am and Balad paired for the 2019 elections, after the Joint List broke up — the Islamists and the secular nationalists, who agree on almost nothing, on one ballot.",
  "joint-list":
    "All four Arab parties on a single ticket from 2015, forced together when the threshold was raised to 3.25%. At its peak it was the third largest list in the Knesset, and it was never invited into a coalition.",
  raam: "The southern branch of the Islamic Movement under Mansour Abbas, and in 2021 the first independent Arab party ever to join an Israeli coalition — on the explicit argument that budgets are worth more than protest.",

  // ── The ethnic, sectoral and satellite lists of the early Knessets ───────
  sephardim:
    "Sephardim and Oriental Communities, one of the ethnic lists of the first Knessets — the same constituency Shas would organise permanently thirty-five years later.",
  yemenite:
    "The Yemenite Association, one of several community lists that won seats before the large parties learned to absorb them.",
  wizo: "The Women's International Zionist Organization, which ran its own list in 1949 and won a seat with it.",
  nazareth:
    "The Democratic List of Nazareth: one of the Arab satellite lists Mapai ran, a separate ballot for votes the ruling party could not ask for under its own name.",
  "democratic-arabs":
    "A Mapai-sponsored Arab list — the party organising a constituency it wanted the seats of, without offering it a place on the party's own ticket.",
  "arab-bedouin":
    "The Arab List for Bedouins and Villagers, another of the satellite lists run under Mapai's patronage in the years of the military government.",
  agriculture:
    "Agriculture and Development, one of Mapai's affiliated Arab lists — the names varied from election to election, the arrangement did not.",
  cooperation:
    "Cooperation and Brotherhood, another Mapai-affiliated Arab list of the 1950s and 1960s.",
  "progress-development":
    "Progress and Development, a Mapai satellite Arab list that reappeared under that name across several elections.",
  "progress-work":
    "Progress and Work, one more of the affiliated Arab lists through which Mapai collected votes in the Arab towns.",
};

/** The note for a list, or null when there is none. */
export const partyHistory = (key: string): string | null => PARTY_HISTORY[key] ?? null;
