"""Return-load matcher — the #1 fleet value driver."""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass

from app.llm import chat_completion


@dataclass
class ReturnLoadProposal:
    original_load_id: str
    original_load_tyre_code: str
    return_load_id: str | None
    return_load_tyre_code: str | None
    driver_id: str
    driver_phone: str
    driver_locale: str
    match_score: float  # 0.0-1.0
    match_reasoning: str
    total_revenue: float  # head-haul + return-haul (INR)
    tyre_take_rate: float  # 1% of total
    status: str = "PROPOSED"  # PROPOSED | ACCEPTED | REJECTED | EXPIRED


class ReturnLoadMatcher:
    """
    Matches return loads for drivers who have accepted a head-haul load.

    Trigger:
      When driver accepts Patna→Delhi load, this runs in parallel
      to find Delhi→Patna return loads.

    Logic:
      1. Search DB for open loads with origin = head-haul destination
      2. Filter by truck type compatibility + driver availability window
      3. AI ranks matches by:
         - Geographic proximity of return load pickup to head-haul delivery
         - Time window alignment (return load pickup after head-haul delivery + buffer)
         - Rate attractiveness vs market
      4. Generate proposal in driver's preferred locale
      5. If driver accepts → both loads assigned, total revenue calculated

    Revenue:
      - 1% take rate on return load value (₹280 on ₹28K avg return load)
      - Driver earns 60% more per round trip
      - Fleet owner sees utilization jump from 70% to 85%+
    """

    async def find_return_loads(
        self,
        original_load_id: str,
        original_load_tyre_code: str,
        original_origin: str,
        original_destination: str,
        original_rate: float,
        driver_id: str,
        driver_phone: str,
        driver_locale: str,
        truck_type: str,
        expected_delivery_time: str,
    ) -> list[dict]:
        """
        Find return-load matches for a just-accepted head-haul load.

        Returns list of ranked proposals.
        """
        t0 = time.monotonic()

        # 1. Query DB for open loads with origin = original_destination
        # (stub — real impl uses @tyre/db)
        candidate_loads = await self._query_return_candidates(
            origin=original_destination,
            truck_type=truck_type,
            available_after=expected_delivery_time,
        )

        if not candidate_loads:
            return {
                "success": True,
                "message": "No return loads available. Driver will drive empty.",
                "proposals": [],
                "estimated_empty_loss_inr": original_rate * 0.3,  # ~30% lost
            }

        # 2. AI-rank candidates
        ranked = await self._rank_with_ai(
            original_destination=original_destination,
            original_rate=original_rate,
            candidates=candidate_loads,
            truck_type=truck_type,
        )

        # 3. Build proposals
        proposals = []
        for rank, candidate in enumerate(ranked[:3]):  # top 3 only
            total_revenue = original_rate + candidate.get("rate", 0)
            tyre_take = total_revenue * 0.01

            proposal = ReturnLoadProposal(
                original_load_id=original_load_id,
                original_load_tyre_code=original_load_tyre_code,
                return_load_id=candidate.get("id"),
                return_load_tyre_code=candidate.get("tyre_code"),
                driver_id=driver_id,
                driver_phone=driver_phone,
                driver_locale=driver_locale,
                match_score=candidate.get("score", 0.85 - rank * 0.05),  # default if AI didn't score
                match_reasoning=candidate.get("reasoning", f"Return load from {candidate.get('origin', '?')} to {candidate.get('destination', '?')}."),
                total_revenue=total_revenue,
                tyre_take_rate=tyre_take,
            )
            proposals.append(asdict(proposal))

        # 4. Generate driver-facing message in their locale
        driver_message = self._build_driver_message(
            proposals, driver_locale, original_destination
        )

        return {
            "success": True,
            "proposals": proposals,
            "driver_message_localized": driver_message,
            "estimated_empty_loss_avoided_inr": proposals[0]["total_revenue"] - original_rate if proposals else 0,
            "latency_ms": int((time.monotonic() - t0) * 1000),
        }

    async def accept_return_load(
        self, proposal_id: str, driver_id: str
    ) -> dict:
        """Driver accepts a return-load proposal. Books both legs."""
        # Real impl: update ReturnLoadMatch table, create Trip for return load,
        # set up UPI escrow for return load, notify shipper of return load
        return {
            "success": True,
            "proposal_id": proposal_id,
            "driver_id": driver_id,
            "status": "ACCEPTED",
            "message": "Both loads booked. Total revenue: ₹73,000. TYRE fee: ₹730.",
        }

    async def _query_return_candidates(
        self, origin: str, truck_type: str, available_after: str
    ) -> list[dict]:
        """
        Query DB for open loads with origin = head-haul destination.
        Filter by truck type compatibility + pickup time window.
        """
        # Stub — real impl:
        # return await db.load.findMany({
        #     where: {
        #         status: "OPEN",
        #         originRegion: originalDestinationRegion,
        #         truckTypeReq: { contains: truckType },
        #         createdAt: { gte: availableAfter }
        #     },
        #     take: 20
        # })
        return [
            {
                "id": "load_stubs_1",
                "tyre_code": "TYRE-9876",
                "origin": origin,
                "destination": "Patna",
                "rate": 28000,
                "truck_type_req": truck_type,
                "goods_type": "General",
                "weight_tons": 14,
                "pickup_window_start": available_after,
            },
        ]

    async def _rank_with_ai(
        self, original_destination: str, original_rate: float,
        candidates: list[dict], truck_type: str,
    ) -> list[dict]:
        """Use LLM to rank return-load candidates."""
        system = """You are the TYRE Return-Load Matcher.
Given a head-haul load and candidate return loads, rank them by match quality (0.0-1.0).

Scoring factors:
- Geographic proximity of return load pickup to head-haul delivery location
- Time window alignment (return load pickup AFTER head-haul delivery + 2hr buffer)
- Truck type compatibility (exact match > compatible > incompatible)
- Rate attractiveness vs market rate for that lane
- Goods type compatibility (don't suggest food after chemicals without cleaning)

ALWAYS respond in valid JSON only:
{
  "ranked": [
    { "id": "<load_id>", "score": <0.0-1.0>, "reasoning": "<1-sentence English rationale>" }
  ]
}"""

        # Build candidate summary for LLM (avoid f-string list comprehension issues)
        import json as _json
        candidate_summary = _json.dumps([
            {
                "id": c.get("id", "unknown"),
                "tyre_code": c.get("tyre_code", "unknown"),
                "origin": c.get("origin", "unknown"),
                "destination": c.get("destination", "unknown"),
                "rate": c.get("rate", 0),
                "truck_type": c.get("truck_type_req", c.get("truck_type", "unknown")),
                "goods": c.get("goods_type", "unknown"),
                "weight_tons": c.get("weight_tons", 0),
            }
            for c in candidates
        ], ensure_ascii=False)

        user_prompt = f"""Head-haul: delivered to {original_destination}, truck type {truck_type}, head-haul rate ₹{original_rate}

Candidate return loads:
{candidate_summary}

Rank them."""

        try:
            raw = await chat_completion(system, user_prompt, json_mode=True, temperature=0.2)
            import json
            ranked_data = json.loads(raw)
            # Merge scores back into candidate records
            score_map = {r["id"]: (r["score"], r["reasoning"]) for r in ranked_data["ranked"]}
            for c in candidates:
                if c["id"] in score_map:
                    c["score"] = score_map[c["id"]][0]
                    c["reasoning"] = score_map[c["id"]][1]
                else:
                    c["score"] = 0.5
                    c["reasoning"] = "Default match"
            return sorted(candidates, key=lambda x: -x["score"])
        except Exception:
            # Fallback: rule-based ranking
            for c in candidates:
                c["score"] = 0.85
                c["reasoning"] = f"Return load available from {c['origin']} to {c['destination']}."
            return candidates

    def _build_driver_message(
        self, proposals: list[dict], locale: str, destination: str
    ) -> str:
        """Build driver-facing message in their preferred locale."""
        if not proposals:
            templates = {
                "hi": f"{destination} से कोई रिटर्न लोड नहीं मिला। खाली वापस जाना पड़ेगा।",
                "bho": f"{destination} से कोई रिटर्न लोड नहीं मिलल। खाली वापस जाए के पड़ी।",
                "bn": f"{destination} থেকে কোনো রিটার্ন লোড পাওয়া যায়নি। খালি ফিরে যেতে হবে।",
                "mr": f"{destination} मधून कोणताही रिटर्न लोड सापडला नाही. रिकामी परत जावे लागेल.",
                "en": f"No return load found from {destination}. Will need to drive back empty.",
            }
            return templates.get(locale, templates["en"])

        top = proposals[0]
        # Return load rate = total revenue - original head-haul rate
        # (proposals store total_revenue = head_haul + return, but we don't have original_rate here)
        # Use the tyre_take_rate as a proxy indicator; show total revenue + match reasoning
        templates = {
            "hi": (
                f"भाई, {destination} से रिटर्न लोड मिला!\n\n"
                f"लोड: {top['return_load_tyre_code']}\n"
                f"{top['match_reasoning']}\n"
                f"कुल कमाई (दोनों लोड): ₹{top['total_revenue']:.0f}\n"
                f"TYRE फीस: ₹{top['tyre_take_rate']:.0f}\n\n"
                f"दोनों लोड बुक करें?"
            ),
            "bho": (
                f"भाई, {destination} से रिटर्न लोड मिलल!\n\n"
                f"लोड: {top['return_load_tyre_code']}\n"
                f"{top['match_reasoning']}\n"
                f"कुल कमाई (दूनो लोड): ₹{top['total_revenue']:.0f}\n"
                f"TYRE फीस: ₹{top['tyre_take_rate']:.0f}\n\n"
                f"दूनो लोड बुक करीं?"
            ),
            "en": (
                f"Return load found from {destination}!\n\n"
                f"Load: {top['return_load_tyre_code']}\n"
                f"{top['match_reasoning']}\n"
                f"Total revenue (both loads): ₹{top['total_revenue']:.0f}\n"
                f"TYRE fee: ₹{top['tyre_take_rate']:.0f}\n\n"
                f"Book both loads?"
            ),
        }
        return templates.get(locale, templates["en"])
