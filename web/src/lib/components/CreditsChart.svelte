<script lang="ts">
	/**
	 * Credits Over Time - line chart with 3 series:
	 *   1. Bot Credits (sum of all bot wallets)
	 *   2. Faction Treasury (faction-wide credits)
	 *   3. Total (bot + faction)
	 */
	import Chart from "./Chart.svelte";
	import { fleetStats, factionState, getAuthHeaders } from "$stores/websocket";

	type Range = "1h" | "1d" | "1w" | "1m";

	interface DataPoint {
		time: string;
		credits: number;
		factionCredits?: number;
	}

	interface Props {
		data?: DataPoint[];
	}

	let { data }: Props = $props();

	let range = $state<Range>("1h");
	let history = $state<DataPoint[]>([]);
	let lastAppend = 0;

	const isFleetMode = $derived(data === undefined);
	const chartData = $derived(isFleetMode ? history : data!);

	async function fetchHistory(r: Range) {
		try {
			const res = await fetch(`/api/credits?range=${r}`, { headers: getAuthHeaders() });
			if (res.ok) {
				history = await res.json();
			}
		} catch {
			// silent
		}
	}

	$effect(() => {
		if (isFleetMode) {
			fetchHistory(range);
		}
	});

	// Append live data from WebSocket every 30s
	$effect(() => {
		if (isFleetMode && $fleetStats && $fleetStats.totalCredits > 0) {
			const now = Date.now();
			if (now - lastAppend >= 30_000) {
				lastAppend = now;
				history = [...history, {
					time: new Date().toISOString(),
					credits: $fleetStats.totalCredits,
					factionCredits: $factionState?.credits ?? 0,
				}];
			}
		}
	});

	function setRange(r: Range) {
		range = r;
		lastAppend = 0;
	}

	const RANGES: { label: string; value: Range }[] = [
		{ label: "1H", value: "1h" },
		{ label: "1D", value: "1d" },
		{ label: "1W", value: "1w" },
		{ label: "1M", value: "1m" },
	];

	const option = $derived.by(() => {
		if (!chartData || chartData.length === 0) return null;

		const times = chartData.map((d) => {
			if (!isFleetMode || range === "1h" || range === "1d") return d.time.slice(11, 16);
			return d.time.slice(5, 10) + " " + d.time.slice(11, 16);
		});
		const botValues = chartData.map((d) => d.credits);
		const factionValues = chartData.map((d) => d.factionCredits ?? 0);
		const totalValues = chartData.map((d, i) => d.credits + (d.factionCredits ?? 0));

		// Only show faction/total if we have faction data
		const hasFaction = factionValues.some(v => v > 0);

		return {
			tooltip: {
				trigger: "axis",
				backgroundColor: "#0d1321ee",
				borderColor: "#3d5a6c",
				textStyle: { color: "#e8f4f8", fontSize: 12 },
				formatter: (params: any) => {
					const pp = Array.isArray(params) ? params : [params];
					let html = `<b>${pp[0]?.axisValue ?? ""}</b>`;
					for (const p of pp) {
						html += `<br/><span style="color:${p.color}">${p.seriesName}:</span> ${(p.value ?? 0).toLocaleString()} cr`;
					}
					return html;
				},
			},
			xAxis: {
				type: "category",
				data: times,
				axisLine: { lineStyle: { color: "#3d5a6c" } },
				axisLabel: { color: "#a8c5d6", fontSize: 10 },
				boundaryGap: false,
			},
			yAxis: {
				type: "value",
				axisLine: { show: false },
				splitLine: { lineStyle: { color: "#1a274444" } },
				axisLabel: {
					color: "#a8c5d6",
					fontSize: 10,
					formatter: (v: number) => {
						if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
						if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
						return `${v}`;
					},
				},
			},
			legend: {
				data: hasFaction ? ["Bot Credits", "Faction Treasury", "Total"] : ["Bot Credits"],
				textStyle: { color: "#a8c5d6", fontSize: 10 },
				top: 0,
				right: 10,
			},
			series: [
				{
					name: "Bot Credits",
					type: "line",
					data: botValues,
					smooth: true,
					showSymbol: false,
					lineStyle: { color: "#00d4ff", width: 2 },
					areaStyle: {
						color: {
							type: "linear",
							x: 0, y: 0, x2: 0, y2: 1,
							colorStops: [
								{ offset: 0, color: "rgba(0, 212, 255, 0.1)" },
								{ offset: 1, color: "rgba(0, 212, 255, 0.01)" },
							],
						},
					},
				},
				...(hasFaction ? [
					{
						name: "Faction Treasury",
						type: "line",
						data: factionValues,
						smooth: true,
						showSymbol: false,
						lineStyle: { color: "#f59e0b", width: 2 },
						areaStyle: {
							color: {
								type: "linear",
								x: 0, y: 0, x2: 0, y2: 1,
								colorStops: [
									{ offset: 0, color: "rgba(245, 158, 11, 0.1)" },
									{ offset: 1, color: "rgba(245, 158, 11, 0.01)" },
								],
							},
						},
					},
					{
						name: "Total",
						type: "line",
						data: totalValues,
						smooth: true,
						showSymbol: false,
						lineStyle: { color: "#22c55e", width: 2, type: "dashed" as const },
					},
				] : []),
			],
			grid: { left: 8, right: 8, top: 24, bottom: 8 },
		} as any;
	});
</script>

{#if isFleetMode}
	<div class="flex items-center justify-between mb-2">
		<h2 class="text-sm font-semibold text-chrome-silver uppercase tracking-wider">
			Credits Over Time
		</h2>
		<div class="flex gap-1">
			{#each RANGES as r}
				<button
					class="px-2 py-0.5 text-xs rounded transition-colors {range === r.value
						? 'bg-plasma-cyan/20 text-plasma-cyan'
						: 'text-hull-grey hover:text-chrome-silver'}"
					onclick={() => setRange(r.value)}
				>
					{r.label}
				</button>
			{/each}
		</div>
	</div>
{/if}

{#if option}
	<Chart {option} />
{:else}
	<div class="w-full h-full flex items-center justify-center text-hull-grey text-sm">
		Collecting credit data...
	</div>
{/if}
