<script lang="ts">
	import { onMount } from "svelte";
	import { bots, fleetStats, connectionState, economy, getAuthHeaders } from "$stores/websocket";
	import CreditsChart from "$lib/components/CreditsChart.svelte";

	// Per-bot 24h revenue from financial events
	let botRevenue24h = $state<Record<string, number>>({});

	async function fetchBotRevenue() {
		try {
			const res = await fetch("/api/economy/bot-breakdown?range=1d", { headers: getAuthHeaders() });
			if (!res.ok) return;
			const data: Array<{ botId: string; revenue: number; cost: number }> = await res.json();
			const map: Record<string, number> = {};
			for (const d of data) {
				if (d.botId) map[d.botId] = Math.round((d.revenue ?? 0) - (d.cost ?? 0));
			}
			botRevenue24h = map;
		} catch { /* non-critical */ }
	}

	onMount(() => {
		fetchBotRevenue();
		const interval = setInterval(fetchBotRevenue, 60000); // Refresh every minute
		return () => clearInterval(interval);
	});

	const ROLE_LABELS: Record<string, string> = {
		ore_miner: "Miner-Ore",
		crystal_miner: "Miner-Crystal",
		gas_harvester: "Miner-Gas",
		ice_harvester: "Miner-Ice",
		explorer: "Explorer",
		trader: "Trader",
		crafter: "Crafter",
		quartermaster: "Quartermaster",
		hunter: "Hunter",
		mission_runner: "Mission Runner",
		ship_dealer: "Ship Dealer",
		shipwright: "Crafter-Shipwright",
	};
	function roleLabel(role: string | null): string {
		if (!role) return "--";
		return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
	}

	function poiIcon(name: string | null): string {
		if (!name) return "";
		const n = name.toLowerCase();
		if (n.includes("station") || n.includes("central") || n.includes("hub") || n.includes("exchange") || n.includes("command") || n.includes("relay") || n.includes("memorial") || n.includes("citadel") || n.includes("outpost") || n.includes("rest")) return "🏛";
		if (n.includes("belt") || n.includes("asteroid") || n.includes("extraction") || n.includes("vein")) return "⛏";
		if (n.includes("ice") || n.includes("frost")) return "🧊";
		if (n.includes("gas") || n.includes("vapor") || n.includes("pocket") || n.includes("plume")) return "💨";
		if (n.includes("nebula") || n.includes("scatter") || n.includes("prism")) return "🌌";
		if (n.includes("star") || n.includes("sun")) return "☀";
		if (n.includes("planet") || n.includes("world")) return "🪐";
		if (n.includes("wreck") || n.includes("debris")) return "💀";
		return "📍";
	}

	// Sortable roster — default sort by 24h revenue descending
	let sortKey = $state<"revenue" | "credits" | "name" | "fuel" | "cargo">("revenue");
	let sortDir = $state<"asc" | "desc">("desc");
	function toggleSort(key: typeof sortKey) {
		if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
		else { sortKey = key; sortDir = "desc"; }
	}
	const sortedBots = $derived.by(() => {
		const enriched = [...$bots].map(b => ({ ...b, rev: botRevenue24h[b.id] ?? 0 }));
		const dir = sortDir === "asc" ? 1 : -1;
		enriched.sort((a, b) => {
			let av: number | string = 0, bv: number | string = 0;
			switch (sortKey) {
				case "revenue": av = a.rev; bv = b.rev; break;
				case "credits": av = a.credits; bv = b.credits; break;
				case "name": av = a.username.toLowerCase(); bv = b.username.toLowerCase(); break;
				case "fuel": av = a.fuelPct; bv = b.fuelPct; break;
				case "cargo": av = a.cargoPct; bv = b.cargoPct; break;
			}
			if (typeof av === "string") return dir * (av as string).localeCompare(bv as string);
			return dir * ((av as number) - (bv as number));
		});
		return enriched;
	});

	const routineRevenue = $derived.by(() => {
		const map = new Map<string, { revenue: number; bots: number }>();
		for (const bot of $bots) {
			if (!bot.routine || (bot.status !== "running" && bot.status !== "ready")) continue;
			const existing = map.get(bot.routine) ?? { revenue: 0, bots: 0 };
			existing.revenue += (botRevenue24h[bot.id] ?? 0);
			existing.bots++;
			map.set(bot.routine, existing);
		}
		return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
	});
	const maxRoutineRev = $derived(Math.max(1, ...routineRevenue.map(([,v]) => Math.abs(v.revenue))));
</script>

<svelte:head>
	<title>Fleet - SpaceMolt Commander</title>
</svelte:head>

<div class="space-y-4">
	<!-- Page header -->
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-star-white">Fleet Overview</h1>
		<div class="flex items-center gap-2 text-sm">
			<span
				class="status-dot"
				class:active={$connectionState === "connected"}
				class:error={$connectionState === "disconnected"}
				class:idle={$connectionState === "connecting"}
			></span>
			<span class="text-chrome-silver capitalize">{$connectionState}</span>
		</div>
	</div>

	<!-- Stats row -->
	<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
		<div class="card p-4">
			<p class="text-xs text-chrome-silver uppercase tracking-wider">Total Credits</p>
			<p class="text-2xl font-bold mono text-star-white mt-1">
				{$fleetStats?.totalCredits?.toLocaleString() ?? "---"}
			</p>
		</div>
		<div class="card p-4">
			<p class="text-xs text-chrome-silver uppercase tracking-wider">Hourly Profit</p>
			<p class="text-2xl font-bold mono {$fleetStats && $fleetStats.creditsPerHour >= 0 ? 'text-bio-green' : 'text-claw-red'} mt-1">
				{#if $fleetStats}
					{$fleetStats.creditsPerHour >= 0 ? '+' : ''}{$fleetStats.creditsPerHour.toLocaleString()}
				{:else}
					---
				{/if}
				<span class="text-sm text-chrome-silver">cr/h</span>
			</p>
		</div>
		<div class="card p-4">
			<p class="text-xs text-chrome-silver uppercase tracking-wider">Active Bots</p>
			<p class="text-2xl font-bold mono text-star-white mt-1">
				{$fleetStats ? `${$fleetStats.activeBots}/${$fleetStats.totalBots}` : "---"}
			</p>
		</div>
		<div class="card p-4">
			<p class="text-xs text-chrome-silver uppercase tracking-wider">Net Profit 24h</p>
			<p class="text-2xl font-bold mono {$economy && $economy.netProfit24h >= 0 ? 'text-bio-green' : 'text-claw-red'} mt-1">
				{$economy ? `${$economy.netProfit24h >= 0 ? '+' : ''}${$economy.netProfit24h.toLocaleString()}` : "---"}
				<span class="text-sm text-chrome-silver">cr</span>
			</p>
		</div>
	</div>

	<div class="space-y-4">
		<!-- Credits chart (full width) -->
		<div class="card p-4">
			<div class="h-64">
				<CreditsChart />
			</div>
		</div>

		<!-- Revenue by Routine (full width — leaderboard removed, sort roster instead) -->
			<div class="card p-4">
				<h2 class="text-xs font-semibold text-chrome-silver uppercase tracking-wider mb-3">Revenue by Routine</h2>
				<div class="space-y-2">
					{#each routineRevenue as [routine, data]}
						<div class="space-y-1">
							<div class="flex items-center justify-between text-xs">
								<div class="flex items-center gap-2">
									<span class="capitalize text-star-white">{routine.replace(/_/g, " ")}</span>
									<span class="text-hull-grey">{data.bots} bot{data.bots !== 1 ? 's' : ''}</span>
								</div>
								<span class="font-mono {data.revenue >= 0 ? 'text-bio-green' : 'text-claw-red'}">
									{data.revenue >= 0 ? '+' : ''}{data.revenue.toLocaleString()} cr
								</span>
							</div>
							<div class="w-full h-2 bg-deep-void/50 rounded-full overflow-hidden">
								<div class="h-full rounded-full {data.revenue >= 0 ? 'bg-bio-green/50' : 'bg-claw-red/50'}" style="width: {Math.min(100, (Math.abs(data.revenue) / maxRoutineRev) * 100)}%"></div>
							</div>
						</div>
					{/each}
				</div>

				{#if $economy}
				<div class="mt-4 pt-3 border-t border-hull-grey/10 grid grid-cols-3 gap-2 text-center">
					<div>
						<div class="text-[10px] text-chrome-silver uppercase">Revenue</div>
						<div class="text-sm font-mono text-bio-green">+{$economy.totalRevenue24h?.toLocaleString() ?? 0}</div>
					</div>
					<div>
						<div class="text-[10px] text-chrome-silver uppercase">Costs</div>
						<div class="text-sm font-mono text-claw-red">-{$economy.totalCosts24h?.toLocaleString() ?? 0}</div>
					</div>
					<div>
						<div class="text-[10px] text-chrome-silver uppercase">Net</div>
						<div class="text-sm font-mono {($economy.netProfit24h ?? 0) >= 0 ? 'text-bio-green' : 'text-claw-red'}">{($economy.netProfit24h ?? 0) >= 0 ? '+' : ''}{$economy.netProfit24h?.toLocaleString() ?? 0}</div>
					</div>
				</div>
				{/if}
			</div>

		<!-- Bot roster table (full width) -->
			<div class="card p-4">
				<h2 class="text-sm font-semibold text-chrome-silver uppercase tracking-wider mb-3">
					Bot Roster
				</h2>
				{#if $bots.length === 0}
					<div class="py-12 text-center">
						<p class="text-hull-grey">No bots registered</p>
						<p class="text-sm text-hull-grey mt-1">
							Go to <a href="/bots" class="text-plasma-cyan hover:underline">Bots</a> to add your first bot
						</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="text-left text-xs text-chrome-silver uppercase tracking-wider border-b border-hull-grey/30">
									<th class="pb-2 pr-3 cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("name")}>Bot{sortKey === "name" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
									<th class="pb-2 pr-3">System</th>
									<th class="pb-2 pr-3">POI</th>
									<th class="pb-2 pr-3">Order</th>
									<th class="pb-2 pr-3">State</th>
									<th class="pb-2 pr-3 text-right cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("credits")}>Credits{sortKey === "credits" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
									<th class="pb-2 pr-3 text-right cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("revenue")}>24h{sortKey === "revenue" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
									<th class="pb-2 pr-3 text-right cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("fuel")}>Fuel{sortKey === "fuel" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
									<th class="pb-2 text-right cursor-pointer hover:text-plasma-cyan select-none" onclick={() => toggleSort("cargo")}>Cargo{sortKey === "cargo" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-hull-grey/20">
								{#each sortedBots as bot}
									<tr class="hover:bg-nebula-blue/20 transition-colors">
										<td class="py-1.5 pr-3">
											<div class="flex items-center gap-1.5">
												<span
													class="status-dot flex-shrink-0"
													class:active={bot.status === "running"}
													class:idle={bot.status === "idle" || bot.status === "ready"}
													class:error={bot.status === "error"}
													class:offline={bot.status === "stopping"}
												></span>
												<a href="/bots/{bot.id}" class="text-star-white hover:text-plasma-cyan font-medium text-xs">
													{bot.username}
												</a>
												{#if bot.role}
													<span class="text-plasma-cyan text-[8px] px-1 py-0.5 rounded bg-plasma-cyan/10 border border-plasma-cyan/20 whitespace-nowrap">{roleLabel(bot.role)}</span>
												{/if}
												<span class="text-hull-grey text-[8px]">{bot.shipClass ?? ""}</span>
											</div>
										</td>
										<td class="py-1.5 pr-3 text-xs text-chrome-silver whitespace-nowrap">
											{bot.systemName ?? "?"}{#if bot.docked}<span class="text-bio-green ml-1">⚓</span>{/if}
										</td>
										<td class="py-1.5 pr-3 text-xs max-w-[180px]">
											{#if bot.poiName}
												<span class="text-star-white truncate block" title={bot.poiName}>{poiIcon(bot.poiName)} {bot.poiName}</span>
											{:else}
												<span class="text-hull-grey">--</span>
											{/if}
										</td>
										<td class="py-1.5 pr-3 text-[11px] max-w-[200px]">
											{#if bot.orderDescription}
												<span class="text-warning-yellow truncate block" title={bot.orderDescription}>{bot.orderDescription}</span>
											{:else if bot.routine}
												<span class="text-chrome-silver">{bot.routine}</span>
											{:else}
												<span class="text-hull-grey">--</span>
											{/if}
										</td>
										<td class="py-1.5 pr-3 text-[11px] max-w-[220px]">
											{#if bot.jumpProgress}
												<span class="text-plasma-cyan">Jump {bot.jumpProgress}{#if bot.destination} <span class="text-hull-grey">→</span> {bot.destination}{/if}</span>
											{:else if bot.routineState}
												<span class="text-chrome-silver truncate block" title={bot.routineState}>{bot.routineState}</span>
											{:else}
												<span class="text-hull-grey">{bot.status}</span>
											{/if}
										</td>
										<td class="py-1.5 pr-3 text-right mono text-star-white text-xs">
											{bot.credits.toLocaleString()}
										</td>
										<td class="py-1.5 pr-3 text-right mono text-xs {(botRevenue24h[bot.id] ?? 0) >= 0 ? 'text-bio-green' : 'text-claw-red'}">
											{(botRevenue24h[bot.id] ?? 0) >= 0 ? "+" : ""}{(botRevenue24h[bot.id] ?? 0).toLocaleString()}
										</td>
										<td class="py-1.5 pr-3 text-right mono text-xs">
											<span class={bot.fuelPct < 20 ? "text-claw-red" : bot.fuelPct < 50 ? "text-warning-yellow" : "text-star-white"}>
												{Math.round(bot.fuelPct)}%
											</span>
										</td>
										<td class="py-1.5 text-right mono text-xs">
											<span class="text-star-white">{Math.round(bot.cargoPct)}%</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
	</div>
</div>
