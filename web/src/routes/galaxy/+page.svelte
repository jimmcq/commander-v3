<script lang="ts">
	import { bots, galaxySystems } from "$stores/websocket";
	import type { GalaxySystemSummary } from "../../../../src/types/protocol";

	// ── Sort + filter state ──
	type SortKey = "name" | "empire" | "jumps" | "pois" | "bots" | "intel" | "resources";
	let sortKey = $state<SortKey>("bots");
	let sortDir = $state<"asc" | "desc">("desc");
	let search = $state("");
	let empireFilter = $state("all");
	let resourceFilter = $state("all");
	let presenceFilter = $state<"all" | "with_bots" | "no_bots" | "stale_intel" | "unscanned">("all");
	let expanded = $state<Set<string>>(new Set());

	function toggleSort(k: SortKey) {
		if (sortKey === k) sortDir = sortDir === "asc" ? "desc" : "asc";
		else { sortKey = k; sortDir = "desc"; }
	}
	function toggleExpand(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	// ── Derived data ──
	const HOME_SYSTEM = "sol";

	// BFS shortest path in jumps from sol
	const jumpsFromSol = $derived.by(() => {
		const map = new Map<string, number>();
		map.set(HOME_SYSTEM, 0);
		const queue: string[] = [HOME_SYSTEM];
		const sysById = new Map($galaxySystems.map(s => [s.id, s]));
		while (queue.length > 0) {
			const id = queue.shift()!;
			const dist = map.get(id)!;
			const sys = sysById.get(id);
			if (!sys) continue;
			for (const conn of sys.connections ?? []) {
				if (!map.has(conn)) {
					map.set(conn, dist + 1);
					queue.push(conn);
				}
			}
		}
		return map;
	});

	const botsBySystem = $derived.by(() => {
		const m = new Map<string, typeof $bots>();
		for (const b of $bots) {
			if (!b.systemId) continue;
			if (!m.has(b.systemId)) m.set(b.systemId, []);
			m.get(b.systemId)!.push(b);
		}
		return m;
	});

	function intelAge(sys: GalaxySystemSummary): { ms: number; label: string; color: string } {
		const scans = (sys.pois ?? []).map(p => p.scannedAt ?? 0).filter(t => t > 0);
		if (scans.length === 0) return { ms: Infinity, label: "Never", color: "text-hull-grey" };
		const newest = Math.max(...scans);
		const ms = Date.now() - newest;
		if (ms < 5 * 60 * 1000) return { ms, label: "Live", color: "text-bio-green" };
		if (ms < 60 * 60 * 1000) return { ms, label: `${Math.round(ms / 60000)}m`, color: "text-plasma-cyan" };
		if (ms < 24 * 60 * 60 * 1000) return { ms, label: `${Math.round(ms / 3600000)}h`, color: "text-warning-yellow" };
		return { ms, label: `${Math.round(ms / 86400000)}d`, color: "text-claw-red" };
	}

	function topResources(sys: GalaxySystemSummary): string[] {
		const counts = new Map<string, number>();
		for (const poi of sys.pois ?? []) {
			for (const r of poi.resources ?? []) {
				counts.set(r.resourceId, (counts.get(r.resourceId) ?? 0) + (r.remaining ?? 0));
			}
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([id]) => id);
	}

	function poiTypeCounts(sys: GalaxySystemSummary): Map<string, number> {
		const m = new Map<string, number>();
		for (const p of sys.pois ?? []) {
			m.set(p.type, (m.get(p.type) ?? 0) + 1);
		}
		return m;
	}

	const allEmpires = $derived([...new Set($galaxySystems.map(s => s.empire).filter(Boolean))].sort());
	const allResources = $derived.by(() => {
		const r = new Set<string>();
		for (const sys of $galaxySystems) for (const poi of sys.pois ?? []) for (const res of poi.resources ?? []) r.add(res.resourceId);
		return [...r].sort();
	});

	const enrichedSystems = $derived.by(() => {
		return $galaxySystems.map(sys => {
			const botsHere = botsBySystem.get(sys.id) ?? [];
			const intel = intelAge(sys);
			const resources = topResources(sys);
			const jumps = jumpsFromSol.get(sys.id) ?? -1;
			return { sys, botsHere, intel, resources, jumps };
		});
	});

	const filteredSorted = $derived.by(() => {
		let list = enrichedSystems;
		// Search
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter(({ sys, resources }) =>
				sys.name.toLowerCase().includes(q) ||
				sys.id.toLowerCase().includes(q) ||
				resources.some(r => r.includes(q))
			);
		}
		// Empire filter
		if (empireFilter !== "all") list = list.filter(({ sys }) => sys.empire === empireFilter);
		// Resource filter
		if (resourceFilter !== "all") list = list.filter(({ sys }) =>
			(sys.pois ?? []).some(p => (p.resources ?? []).some(r => r.resourceId === resourceFilter))
		);
		// Presence filter
		if (presenceFilter === "with_bots") list = list.filter(e => e.botsHere.length > 0);
		else if (presenceFilter === "no_bots") list = list.filter(e => e.botsHere.length === 0);
		else if (presenceFilter === "stale_intel") list = list.filter(e => e.intel.ms > 60 * 60 * 1000 && e.intel.ms !== Infinity);
		else if (presenceFilter === "unscanned") list = list.filter(e => e.intel.ms === Infinity);
		// Sort
		const dir = sortDir === "asc" ? 1 : -1;
		list = [...list].sort((a, b) => {
			let av: number | string = 0, bv: number | string = 0;
			switch (sortKey) {
				case "name": av = a.sys.name.toLowerCase(); bv = b.sys.name.toLowerCase(); break;
				case "empire": av = a.sys.empire; bv = b.sys.empire; break;
				case "jumps": av = a.jumps < 0 ? 9999 : a.jumps; bv = b.jumps < 0 ? 9999 : b.jumps; break;
				case "pois": av = a.sys.pois?.length ?? 0; bv = b.sys.pois?.length ?? 0; break;
				case "bots": av = a.botsHere.length; bv = b.botsHere.length; break;
				case "intel": av = a.intel.ms === Infinity ? Number.MAX_SAFE_INTEGER : a.intel.ms; bv = b.intel.ms === Infinity ? Number.MAX_SAFE_INTEGER : b.intel.ms; break;
				case "resources": av = a.resources.length; bv = b.resources.length; break;
			}
			if (typeof av === "string") return dir * (av as string).localeCompare(bv as string);
			return dir * ((av as number) - (bv as number));
		});
		return list;
	});

	function arrow(k: SortKey): string {
		if (sortKey !== k) return "";
		return sortDir === "desc" ? " ↓" : " ↑";
	}

	function formatRichness(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return String(n);
	}

	function formatTime(ts: number): string {
		if (!ts) return "never";
		return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
	}

	function poiTypeIcon(type: string): string {
		const t = type.toLowerCase();
		if (t.includes("station") || t.includes("base") || t.includes("outpost")) return "🏛";
		if (t.includes("belt") || t.includes("asteroid") || t.includes("vein")) return "⛏";
		if (t.includes("ice")) return "🧊";
		if (t.includes("gas") || t.includes("nebula") || t.includes("cloud")) return "💨";
		if (t.includes("wreck") || t.includes("debris") || t.includes("scrap")) return "💀";
		if (t.includes("planet")) return "🪐";
		if (t.includes("star") || t.includes("sun")) return "☀";
		if (t.includes("anomaly")) return "❓";
		return "📍";
	}
</script>

<svelte:head><title>Systems - SpaceMolt Commander</title></svelte:head>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-star-white">Systems Browser</h1>
		<div class="text-xs text-hull-grey">
			{filteredSorted.length} / {$galaxySystems.length} systems · {$bots.length} bots
		</div>
	</div>

	<!-- Filters -->
	<div class="card p-3 space-y-2">
		<div class="flex flex-wrap gap-2 items-center">
			<input
				type="text"
				bind:value={search}
				placeholder="Search system, id, or resource…"
				class="bg-deep-void border border-hull-grey/30 rounded px-3 py-1.5 text-sm text-star-white placeholder:text-hull-grey w-64 focus:outline-none focus:border-plasma-cyan"
			/>
			<select bind:value={empireFilter} class="bg-deep-void border border-hull-grey/30 rounded px-2 py-1.5 text-xs text-star-white">
				<option value="all">All Empires</option>
				{#each allEmpires as e}<option value={e}>{e}</option>{/each}
			</select>
			<select bind:value={resourceFilter} class="bg-deep-void border border-hull-grey/30 rounded px-2 py-1.5 text-xs text-star-white max-w-[180px]">
				<option value="all">Any Resource</option>
				{#each allResources as r}<option value={r}>{r.replace(/_/g, " ")}</option>{/each}
			</select>
			<div class="flex gap-1 bg-deep-void rounded p-0.5 border border-hull-grey/30">
				{#each [["all","All"],["with_bots","With Bots"],["no_bots","No Bots"],["stale_intel","Stale Intel"],["unscanned","Unscanned"]] as [val,lbl]}
					<button
						class="px-2 py-1 text-[10px] rounded transition-colors {presenceFilter === val ? 'bg-plasma-cyan/20 text-plasma-cyan' : 'text-hull-grey hover:text-star-white'}"
						onclick={() => presenceFilter = val as typeof presenceFilter}
					>{lbl}</button>
				{/each}
			</div>
			{#if search || empireFilter !== "all" || resourceFilter !== "all" || presenceFilter !== "all"}
				<button
					class="text-[10px] px-2 py-1 rounded text-hull-grey hover:text-claw-red"
					onclick={() => { search = ""; empireFilter = "all"; resourceFilter = "all"; presenceFilter = "all"; }}
				>Clear</button>
			{/if}
		</div>
	</div>

	<!-- Systems Table -->
	<div class="card overflow-hidden">
		<div class="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
			<table class="w-full text-xs">
				<thead class="sticky top-0 bg-deep-void z-10 border-b border-hull-grey/30">
					<tr class="text-left text-chrome-silver uppercase tracking-wider">
						<th class="py-2 pl-3 pr-2 w-6"></th>
						<th class="py-2 pr-3 cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("name")}>System{arrow("name")}</th>
						<th class="py-2 pr-3 cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("empire")}>Empire{arrow("empire")}</th>
						<th class="py-2 pr-3 text-center cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("jumps")}>Jumps{arrow("jumps")}</th>
						<th class="py-2 pr-3 text-center cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("pois")}>POIs{arrow("pois")}</th>
						<th class="py-2 pr-3 text-center cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("bots")}>Bots{arrow("bots")}</th>
						<th class="py-2 pr-3 cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("intel")}>Intel{arrow("intel")}</th>
						<th class="py-2 pr-3">Top Resources</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-hull-grey/10">
					{#each filteredSorted as { sys, botsHere, intel, resources, jumps } (sys.id)}
						<tr
							class="hover:bg-nebula-blue/10 cursor-pointer transition-colors"
							onclick={() => toggleExpand(sys.id)}
						>
							<td class="py-1.5 pl-3 pr-2 text-hull-grey">{expanded.has(sys.id) ? "▼" : "▶"}</td>
							<td class="py-1.5 pr-3">
								<div class="flex items-center gap-2">
									<span class="text-star-white font-medium">{sys.name}</span>
									{#if !sys.visited}<span class="text-[9px] text-hull-grey">unvisited</span>{/if}
								</div>
							</td>
							<td class="py-1.5 pr-3 text-chrome-silver capitalize">{sys.empire || "—"}</td>
							<td class="py-1.5 pr-3 text-center mono">
								{#if jumps < 0}
									<span class="text-hull-grey">∞</span>
								{:else if jumps === 0}
									<span class="text-warning-yellow font-bold">★</span>
								{:else}
									<span class="text-chrome-silver">{jumps}</span>
								{/if}
							</td>
							<td class="py-1.5 pr-3 text-center mono text-chrome-silver">{sys.pois?.length ?? sys.poiCount ?? 0}</td>
							<td class="py-1.5 pr-3 text-center mono">
								{#if botsHere.length > 0}
									<span class="text-bio-green font-bold">{botsHere.length}</span>
								{:else}
									<span class="text-hull-grey">·</span>
								{/if}
							</td>
							<td class="py-1.5 pr-3"><span class={intel.color}>{intel.label}</span></td>
							<td class="py-1.5 pr-3">
								{#if resources.length === 0}
									<span class="text-hull-grey">—</span>
								{:else}
									<div class="flex flex-wrap gap-1">
										{#each resources.slice(0, 4) as r}
											<span class="text-[9px] px-1 py-0.5 rounded bg-shell-orange/10 text-shell-orange">{r.replace(/_/g, " ")}</span>
										{/each}
										{#if resources.length > 4}<span class="text-[9px] text-hull-grey">+{resources.length - 4}</span>{/if}
									</div>
								{/if}
							</td>
						</tr>

						{#if expanded.has(sys.id)}
							<tr class="bg-deep-void/50">
								<td colspan="8" class="px-6 py-3">
									<div class="space-y-3">
										<!-- System metadata -->
										<div class="flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
											<div><span class="text-hull-grey">ID:</span> <span class="text-chrome-silver mono">{sys.id}</span></div>
											<div><span class="text-hull-grey">Police:</span> <span class="text-chrome-silver">L{sys.policeLevel ?? 0}</span></div>
											<div><span class="text-hull-grey">Connections:</span> <span class="text-chrome-silver">{sys.connections?.length ?? 0}</span></div>
											<div><span class="text-hull-grey">POIs:</span> <span class="text-chrome-silver">{sys.pois?.length ?? 0}</span></div>
											<div><span class="text-hull-grey">Visited:</span> <span class={sys.visited ? 'text-bio-green' : 'text-claw-red'}>{sys.visited ? 'yes' : 'no'}</span></div>
										</div>

										<!-- Bots in system -->
										{#if botsHere.length > 0}
											<div>
												<div class="text-[10px] text-chrome-silver uppercase mb-1">Bots Here ({botsHere.length})</div>
												<div class="flex flex-wrap gap-1">
													{#each botsHere as b}
														<a href="/bots/{b.id}" class="text-[10px] px-2 py-0.5 rounded bg-plasma-cyan/10 text-plasma-cyan border border-plasma-cyan/30 hover:bg-plasma-cyan/20">{b.username}</a>
													{/each}
												</div>
											</div>
										{/if}

										<!-- Connections -->
										{#if sys.connections && sys.connections.length > 0}
											<div>
												<div class="text-[10px] text-chrome-silver uppercase mb-1">Connected Systems</div>
												<div class="flex flex-wrap gap-1">
													{#each sys.connections as connId}
														{@const target = $galaxySystems.find(s => s.id === connId)}
														<span class="text-[10px] px-2 py-0.5 rounded bg-nebula-blue/30 text-chrome-silver">{target?.name ?? connId}</span>
													{/each}
												</div>
											</div>
										{/if}

										<!-- POIs -->
										{#if sys.pois && sys.pois.length > 0}
											<div>
												<div class="text-[10px] text-chrome-silver uppercase mb-1">Points of Interest ({sys.pois.length})</div>
												<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
													{#each sys.pois as poi}
														<div class="rounded border border-hull-grey/20 bg-deep-void/70 p-2">
															<div class="flex items-start justify-between gap-2 mb-1">
																<div class="flex-1 min-w-0">
																	<div class="flex items-center gap-1.5">
																		<span>{poiTypeIcon(poi.type)}</span>
																		<span class="text-[11px] text-star-white font-medium truncate" title={poi.name}>{poi.name}</span>
																	</div>
																	<div class="text-[9px] text-hull-grey mt-0.5">{poi.type.replace(/_/g, " ")}</div>
																</div>
																{#if poi.hasBase}
																	<span class="text-[9px] px-1.5 py-0.5 rounded bg-bio-green/10 text-bio-green border border-bio-green/30 shrink-0">DOCK</span>
																{/if}
															</div>
															{#if poi.baseName}
																<div class="text-[10px] text-plasma-cyan mt-1">📍 {poi.baseName}</div>
															{/if}
															{#if poi.resources && poi.resources.length > 0}
																<div class="mt-1.5 space-y-0.5">
																	{#each poi.resources.sort((a, b) => (b.remaining ?? 0) - (a.remaining ?? 0)) as r}
																		<div class="flex items-center justify-between gap-2 text-[10px]">
																			<span class="text-chrome-silver truncate">{r.resourceId.replace(/_/g, " ")}</span>
																			<div class="flex items-center gap-1 shrink-0">
																				{#if r.richness > 0}
																					<span class="text-shell-orange" title="Richness">★{r.richness}</span>
																				{:else}
																					<span class="text-hull-grey" title="Depleted">depl</span>
																				{/if}
																				<span class="mono text-bio-green/80">{formatRichness(r.remaining ?? 0)}</span>
																			</div>
																		</div>
																	{/each}
																</div>
															{/if}
															{#if poi.scannedAt}
																<div class="text-[9px] text-hull-grey mt-1.5 pt-1 border-t border-hull-grey/10">
																	scanned {formatTime(poi.scannedAt)}
																</div>
															{:else}
																<div class="text-[9px] text-hull-grey mt-1.5 pt-1 border-t border-hull-grey/10 italic">
																	never scanned
																</div>
															{/if}
														</div>
													{/each}
												</div>
											</div>
										{:else if !sys.visited}
											<div class="text-[11px] text-hull-grey italic">No POI data — system not yet visited.</div>
										{/if}
									</div>
								</td>
							</tr>
						{/if}
					{:else}
						<tr><td colspan="8" class="text-center py-8 text-hull-grey">No systems match the current filters.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
