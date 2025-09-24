#!/usr/bin/env python3
"""Generate unit shift schedule using OR-Tools CP-SAT.

Reads JSON from stdin with the following structure:
{
  "unit": {"id": 1, "code": "1AB"},
  "month": "2025-09",
  "days": ["2025-09-01", ...],
  "members": [
    {
      "id": 10,
      "name": "...",
      "employment_type": "full_time",
      "can_night_shift": true
    }
  ],
  "coverage_requirements": {"early": 1, "day": 1, "late": 1, "night": 1},
  "constraints": {
    "max_nights_per_member": 7
  }
}

Outputs JSON to stdout:
{
  "assignments": [
    {
      "date": "2025-09-01",
      "shifts": {
        "EARLY": {"user_id": 10},
        "DAY": {"user_id": 11},
        ...
      }
    },
    ...
  ],
  "summary": {
    "work_days": {"10": 20, ...},
    "off_days": {"10": 10, ...},
    "nights": {"10": 4, ...}
  }
}
"""

from __future__ import annotations

import json
import sys
import datetime
from dataclasses import dataclass
from typing import Dict, List, Any, Tuple, Optional, Set

from ortools.sat.python import cp_model

SHIFT_CODES = ["EARLY", "DAY", "LATE", "NIGHT", "NIGHT_AFTER", "OFF"]
WORK_SHIFT_CODES = ["EARLY", "DAY", "LATE", "NIGHT"]
WEEKDAY_KEYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


@dataclass
class Member:
    id: int
    employment_type: str
    can_night_shift: bool
    allowed_shift_codes: Optional[List[str]]
    schedule_preferences: Optional[Dict[str, Any]]


def normalize_allowed_codes(raw: Any) -> Optional[List[str]]:
    if raw is None:
        return None
    if not isinstance(raw, list):
        return None

    normalized: List[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        code = item.strip().upper()
        if code in SHIFT_CODES and code not in normalized:
            normalized.append(code)

    return normalized


def parse_input() -> Dict:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        raise SystemExit(json.dumps({"error": f"Invalid JSON input: {exc}"}))

    required_keys = ["unit", "month", "days", "members", "coverage_requirements"]
    for key in required_keys:
        if key not in payload:
            raise SystemExit(json.dumps({"error": f"Missing key: {key}"}))

    return payload


def to_bool(value, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.lower()
        if lowered in {"1", "true", "yes"}:
            return True
        if lowered in {"0", "false", "no"}:
            return False
    return bool(value)


def to_minutes(time_str: str | None) -> int | None:
    if not time_str:
        return None
    try:
        hours, minutes = [int(part) for part in time_str.split(":", 1)]
    except ValueError:
        return None
    return hours * 60 + minutes


def infer_shift_category(
    shift_code: str | None,
    start_at: str | None,
    end_at: str | None,
) -> str | None:
    if shift_code:
        direct_map = {
            "EARLY": "EARLY",
            "DAY": "DAY",
            "LATE": "LATE",
            "NIGHT": "NIGHT",
            "NIGHT_AFTER": "NIGHT",
            "OFF": None,
        }
        if shift_code in direct_map:
            return direct_map[shift_code]

    start_minutes = to_minutes(start_at)
    end_minutes = to_minutes(end_at)

    if start_minutes is None or end_minutes is None:
        return None

    if end_minutes < start_minutes:
        return "NIGHT"

    if end_minutes >= 20 * 60:
        return "LATE"

    if 7 * 60 <= start_minutes <= (7 * 60 + 30):
        return "EARLY"

    if 8 * 60 <= start_minutes and end_minutes <= 18 * 60:
        return "DAY"

    if start_minutes >= 15 * 60:
        return "NIGHT"

    if start_minutes >= 6 * 60 and start_minutes < 8 * 60:
        return "EARLY"

    if end_minutes >= 18 * 60:
        return "LATE"

    return "DAY"


def create_empty_breakdown() -> Dict[str, int]:
    return {code: 0 for code in WORK_SHIFT_CODES}


def build_model(data: Dict):
    members: List[Member] = [
        Member(
            id=int(m["id"]),
            employment_type=str(m.get("employment_type", "member")),
            can_night_shift=bool(m.get("can_night_shift", True)),
            allowed_shift_codes=normalize_allowed_codes(m.get("allowed_shift_codes")),
            schedule_preferences=m.get("schedule_preferences"),
        )
        for m in data["members"]
    ]
    days: List[str] = list(data["days"])
    num_members = len(members)
    num_days = len(days)
    coverage_raw = data.get("coverage_requirements", {})
    constraints = data.get("constraints", {})
    existing_assignments = data.get("existing_assignments", [])

    def normalize_date_key(raw_value: Any) -> Optional[str]:
        if raw_value is None:
            return None
        if isinstance(raw_value, str):
            value = raw_value.strip()
        else:
            value = str(raw_value).strip()
        if not value:
            return None
        try:
            return datetime.date.fromisoformat(value).isoformat()
        except ValueError:
            return None

    day_dates: List[datetime.date] = [datetime.date.fromisoformat(date_str) for date_str in days]
    weekday_labels: List[str] = [WEEKDAY_KEYS[date.weekday()] for date in day_dates]
    date_to_index: Dict[str, int] = {date: idx for idx, date in enumerate(days)}

    holiday_dates_raw = constraints.get("holiday_dates", [])
    holiday_dates_set: Set[str] = set()
    if isinstance(holiday_dates_raw, list):
        for entry in holiday_dates_raw:
            normalized_date = normalize_date_key(entry)
            if normalized_date:
                holiday_dates_set.add(normalized_date)

    holiday_flags: List[bool] = [days[idx] in holiday_dates_set for idx in range(num_days)]

    generation_end_str = constraints.get("generation_end_date")
    generation_end_date: Optional[datetime.date] = None
    if generation_end_str:
        try:
            generation_end_date = datetime.date.fromisoformat(str(generation_end_str))
        except ValueError:
            generation_end_date = None

    max_nights = int(constraints.get("max_nights_per_member", 7))
    time_limit = float(constraints.get("time_limit", 20))

    def clamp_min_off_days(raw_value, fallback: int) -> int:
        if raw_value is None:
            return fallback
        try:
            value = int(raw_value)
        except (TypeError, ValueError):
            return fallback
        return max(0, min(value, num_days))

    general_min_off_raw = constraints.get("min_off_days")
    base_min_off = clamp_min_off_days(general_min_off_raw, 0)
    min_off_full_time = clamp_min_off_days(
        constraints.get("min_off_days_full_time"), base_min_off
    )
    part_time_fallback = base_min_off if general_min_off_raw is not None else 10
    min_off_part_time = clamp_min_off_days(
        constraints.get("min_off_days_part_time"), part_time_fallback
    )
    min_off_contract = clamp_min_off_days(
        constraints.get("min_off_days_contract"), min_off_part_time
    )
    min_off_by_type = {
        "full_time": min_off_full_time,
        "part_time": min_off_part_time,
        "contract": min_off_contract,
    }
    default_min_off = base_min_off

    enforce_night_rest = to_bool(constraints.get("enforce_night_after_rest"), True)
    forbid_late_to_early = to_bool(constraints.get("forbid_late_to_early"), True)
    limit_fulltime_repeat = to_bool(constraints.get("limit_fulltime_repeat"), True)
    balance_workload = to_bool(constraints.get("balance_workload"), True)

    def get_required(code: str) -> int:
        return int(coverage_raw.get(code.lower(), coverage_raw.get(code, 0)) or 0)

    def parse_optional_int(raw_value) -> Optional[int]:
        if raw_value is None:
            return None
        try:
            return int(raw_value)
        except (TypeError, ValueError):
            return None

    required_per_shift: Dict[str, int] = {code: get_required(code) for code in WORK_SHIFT_CODES}
    base_day_required = required_per_shift["DAY"]

    desired_day_headcount_raw = constraints.get("desired_day_headcount")
    if desired_day_headcount_raw is None:
        desired_day_headcount_raw = coverage_raw.get("day_desired")

    desired_day_headcount = parse_optional_int(desired_day_headcount_raw)
    if desired_day_headcount is None:
        desired_day_headcount = base_day_required

    desired_day_headcount = max(base_day_required, min(desired_day_headcount, num_members))
    raw_max_consecutive = constraints.get("max_consecutive_workdays")
    max_consecutive_workdays: Optional[int] = None
    if raw_max_consecutive is not None:
        try:
            parsed_consecutive = int(raw_max_consecutive)
        except (TypeError, ValueError):
            parsed_consecutive = None

        if parsed_consecutive is not None and parsed_consecutive > 0:
            max_consecutive_workdays = min(parsed_consecutive, num_days)

    if num_members == 0 or num_days == 0:
        raise SystemExit(json.dumps({"error": "Members or days are empty"}))

    model = cp_model.CpModel()

    member_index = {member.id: idx for idx, member in enumerate(members)}
    day_index = {date: idx for idx, date in enumerate(days)}

    x = {}
    for u in range(num_members):
        for d in range(num_days):
            for s in SHIFT_CODES:
                x[(u, d, s)] = model.NewBoolVar(f"x_u{u}_d{d}_{s}")

    for u in range(num_members):
        for d in range(num_days):
            if generation_end_date and day_dates[d] > generation_end_date:
                model.Add(sum(x[(u, d, s)] for s in SHIFT_CODES) <= 1)
            else:
                model.Add(sum(x[(u, d, s)] for s in SHIFT_CODES) == 1)

    fixed_requirements: Dict[Tuple[int, str], int] = {}
    pinned_assignments: Dict[Tuple[int, int], str] = {}
    conflicts: List[Dict[str, Any]] = []
    for assignment in existing_assignments:
        member_id = assignment.get("user_id")
        date = assignment.get("date")
        code = assignment.get("shift_code")

        if member_id not in member_index or date not in day_index:
            continue

        code = str(code).upper()
        if code not in SHIFT_CODES:
            continue

        u = member_index[member_id]
        d = day_index[date]
        key = (u, d)

        allowed_codes = members[u].allowed_shift_codes
        if allowed_codes is not None and code not in allowed_codes:
            conflicts.append(
                {
                    "type": "allowed_shift_conflict",
                    "member_id": members[u].id,
                    "date": days[d],
                    "shift_code": code,
                }
            )

        pinned_code = pinned_assignments.get(key)
        if pinned_code is not None:
            if pinned_code != code:
                conflicts.append(
                    {
                        "type": "existing_assignment_conflict",
                        "member_id": members[u].id,
                        "date": days[d],
                        "codes": sorted({pinned_code, code}),
                    }
                )
            continue

        pinned_assignments[key] = code
        if code in WORK_SHIFT_CODES:
            fixed_requirements[(d, code)] = fixed_requirements.get((d, code), 0) + 1

    default_allowed_codes = set(WORK_SHIFT_CODES + ["OFF", "NIGHT_AFTER"])

    allowed_shift_sets: List[Set[str]] = []
    for member in members:
        if member.allowed_shift_codes is None:
            allowed_shift_sets.append(default_allowed_codes.copy())
        else:
            allowed = set(code for code in (member.allowed_shift_codes or []) if code in SHIFT_CODES)
            allowed |= {"OFF", "NIGHT_AFTER"}
            allowed_shift_sets.append(allowed)

    forced_off_days_by_member: List[Set[int]] = []
    for member in members:
        preferences = member.schedule_preferences or {}
        fixed_map = preferences.get("fixed_days_off") or {}
        custom_dates_off = preferences.get("custom_dates_off") or []
        forced_indices: Set[int] = set()

        for idx, weekday_key in enumerate(weekday_labels):
            if bool(fixed_map.get(weekday_key)):
                forced_indices.add(idx)
                continue
            if holiday_flags[idx] and bool(fixed_map.get("holiday")):
                forced_indices.add(idx)

        if isinstance(custom_dates_off, list):
            for raw_date in custom_dates_off:
                normalized_date = normalize_date_key(raw_date)
                if normalized_date and normalized_date in date_to_index:
                    forced_indices.add(date_to_index[normalized_date])

        forced_off_days_by_member.append(forced_indices)

    shortage_vars: Dict[Tuple[int, str], cp_model.IntVar] = {}
    day_shortfall_vars: Dict[int, cp_model.IntVar] = {}

    per_day_requirements: List[Dict[str, int]] = []
    desired_day_per_day: List[int] = []

    for d in range(num_days):
        day_requirements: Dict[str, int] = {}
        for s in WORK_SHIFT_CODES:
            base_required = required_per_shift[s]
            fixed = fixed_requirements.get((d, s), 0)
            if generation_end_date and day_dates[d] > generation_end_date:
                day_requirements[s] = max(fixed, 0)
            else:
                day_requirements[s] = max(base_required, fixed)
        per_day_requirements.append(day_requirements)

        required_day = day_requirements["DAY"]
        is_generation_day = generation_end_date is None or day_dates[d] <= generation_end_date

        if not is_generation_day:
            desired_day_per_day.append(required_day)
            continue

        required_other = sum(
            day_requirements[code] for code in WORK_SHIFT_CODES if code != "DAY"
        )
        remaining_capacity = num_members - required_other
        if remaining_capacity < required_day:
            remaining_capacity = required_day
        else:
            remaining_capacity = min(remaining_capacity, num_members)

        fixed_day_assignments = sum(
            1 for u in range(num_members) if pinned_assignments.get((u, d)) == "DAY"
        )
        flexible_day_capacity = sum(
            1
            for u in range(num_members)
            if pinned_assignments.get((u, d)) is None and "DAY" in allowed_shift_sets[u]
        )
        max_day_capacity = max(required_day, fixed_day_assignments + flexible_day_capacity)

        day_target = min(max(desired_day_headcount, required_day), remaining_capacity, max_day_capacity)
        day_requirements["DAY"] = day_target
        desired_day_per_day.append(day_target)

    for d in range(num_days):
        for s in WORK_SHIFT_CODES:
            required = per_day_requirements[d][s]
            sum_expr = sum(x[(u, d, s)] for u in range(num_members))

            if required > 0:
                shortage = model.NewIntVar(0, required, f"shortage_d{d}_{s}")
                shortage_vars[(d, s)] = shortage
                model.Add(sum_expr + shortage == required)

                if s == "DAY":
                    day_shortfall_vars[d] = shortage
            else:
                model.Add(sum_expr == 0)
                if s == "DAY":
                    day_shortfall_vars[d] = model.NewConstant(0)

    # Apply fixed assignments coming from existing data
    for (u, d), code in pinned_assignments.items():
        model.Add(x[(u, d, code)] == 1)

    for u, member in enumerate(members):
        disallowed_codes = {
            code for code in WORK_SHIFT_CODES if code not in allowed_shift_sets[u]
        }

        if disallowed_codes:
            for d in range(num_days):
                for code in disallowed_codes:
                    if pinned_assignments.get((u, d)) == code:
                        conflicts.append(
                            {
                                "type": "allowed_shift_conflict",
                                "member_id": members[u].id,
                                "date": days[d],
                                "shift_code": code,
                            }
                        )
                        continue

                    model.Add(x[(u, d, code)] == 0)

        forced_off_days = forced_off_days_by_member[u]
        if forced_off_days:
            for d in forced_off_days:
                pinned_code = pinned_assignments.get((u, d))
                if pinned_code and pinned_code != "OFF":
                    conflicts.append(
                        {
                            "type": "fixed_day_off_conflict",
                            "member_id": members[u].id,
                            "date": days[d],
                            "shift_code": pinned_code,
                        }
                    )

                    continue

                model.Add(x[(u, d, "OFF")] == 1)
                for code in SHIFT_CODES:
                    if code != "OFF":
                        model.Add(x[(u, d, code)] == 0)

        if max_consecutive_workdays is not None:
            work_day_flags: List[cp_model.IntVar] = []
            for d in range(num_days):
                work_flag = model.NewBoolVar(f"work_u{u}_d{d}")
                model.Add(work_flag == sum(x[(u, d, s)] for s in WORK_SHIFT_CODES))
                work_day_flags.append(work_flag)

            window = max_consecutive_workdays + 1
            if window <= num_days:
                for start in range(0, num_days - max_consecutive_workdays):
                    model.Add(
                        sum(work_day_flags[start : start + window]) <= max_consecutive_workdays
                    )

            pinned_run = 0
            for d in range(num_days):
                pinned_code = pinned_assignments.get((u, d))
                if pinned_code in WORK_SHIFT_CODES:
                    pinned_run += 1
                else:
                    pinned_run = 0

                if pinned_run > max_consecutive_workdays:
                    start_idx = d - pinned_run + 1
                    conflicts.append(
                        {
                            "type": "max_consecutive_workdays_conflict",
                            "member_id": members[u].id,
                            "start_date": days[start_idx],
                            "end_date": days[d],
                            "limit": max_consecutive_workdays,
                        }
                    )
                    break

        # Disallow NIGHT_AFTER unless the previous day is a NIGHT assignment.
        for d in range(1, num_days):
            prev_locked = pinned_assignments.get((u, d - 1))
            current_locked = pinned_assignments.get((u, d))

            if current_locked == "NIGHT_AFTER" and prev_locked and prev_locked != "NIGHT":
                conflicts.append(
                    {
                        "type": "night_after_predecessor_conflict",
                        "member_id": members[u].id,
                        "date": days[d],
                        "previous_date": days[d - 1],
                        "locked_shift": prev_locked,
                    }
                )
                continue

            model.Add(x[(u, d, "NIGHT_AFTER")] <= x[(u, d - 1, "NIGHT")])

        if enforce_night_rest:
            # Enforce NIGHT -> NIGHT_AFTER -> OFF pattern when not blocked by pinned data.
            for d in range(num_days - 1):
                current_locked = pinned_assignments.get((u, d))
                next_locked = pinned_assignments.get((u, d + 1))

                if current_locked == "NIGHT" and next_locked and next_locked != "NIGHT_AFTER":
                    conflicts.append(
                        {
                            "type": "night_follow_up_conflict",
                            "member_id": members[u].id,
                            "date": days[d],
                            "next_date": days[d + 1],
                            "locked_shift": next_locked,
                        }
                    )
                    continue

                if next_locked == "NIGHT_AFTER" and current_locked and current_locked != "NIGHT":
                    conflicts.append(
                        {
                            "type": "night_follow_up_conflict",
                            "member_id": members[u].id,
                            "date": days[d],
                            "next_date": days[d + 1],
                            "locked_shift": current_locked,
                        }
                    )
                    continue

                model.AddImplication(
                    x[(u, d, "NIGHT")],
                    x[(u, d + 1, "NIGHT_AFTER")],
                )

            for d in range(num_days - 2):
                current_locked = pinned_assignments.get((u, d))
                rest_locked = pinned_assignments.get((u, d + 2))

                if current_locked == "NIGHT" and rest_locked and rest_locked != "OFF":
                    conflicts.append(
                        {
                            "type": "night_rest_conflict",
                            "member_id": members[u].id,
                            "date": days[d],
                            "rest_date": days[d + 2],
                            "locked_shift": rest_locked,
                        }
                    )
                    continue

                model.AddImplication(x[(u, d, "NIGHT")], x[(u, d + 2, "OFF")])

        if not member.can_night_shift:
            for d in range(num_days):
                if pinned_assignments.get((u, d)) == "NIGHT":
                    conflicts.append(
                        {
                            "type": "night_eligibility_conflict",
                            "member_id": members[u].id,
                            "date": days[d],
                        }
                    )
                    continue

                model.Add(x[(u, d, "NIGHT")] == 0)
                model.Add(x[(u, d, "NIGHT_AFTER")] == 0)

        if forbid_late_to_early:
            for d in range(num_days - 1):
                current_locked = pinned_assignments.get((u, d))
                next_locked = pinned_assignments.get((u, d + 1))

                if current_locked == "LATE" and next_locked == "EARLY":
                    conflicts.append(
                        {
                            "type": "late_to_early_conflict",
                            "member_id": members[u].id,
                            "date": days[d],
                            "next_date": days[d + 1],
                        }
                    )
                    continue

                model.Add(x[(u, d, "LATE")] + x[(u, d + 1, "EARLY")] <= 1)

        if limit_fulltime_repeat and member.employment_type == "full_time":
            for s in WORK_SHIFT_CODES:
                for d in range(num_days - 2):
                    locked_sequence = [
                        pinned_assignments.get((u, d + offset)) for offset in range(3)
                    ]
                    if all(code == s for code in locked_sequence if code is not None) and None not in locked_sequence:
                        conflicts.append(
                            {
                                "type": "repeat_limit_conflict",
                                "member_id": members[u].id,
                                "start_date": days[d],
                                "shift_code": s,
                            }
                        )
                        continue

                    model.Add(
                        x[(u, d, s)] + x[(u, d + 1, s)] + x[(u, d + 2, s)] <= 2
                    )

        pinned_night_count = sum(
            1 for d in range(num_days) if pinned_assignments.get((u, d)) == "NIGHT"
        )
        if pinned_night_count > max_nights:
            conflicts.append(
                {
                    "type": "night_quota_conflict",
                    "member_id": members[u].id,
                    "nights_locked": pinned_night_count,
                    "max_allowed": max_nights,
                }
            )
        else:
            model.Add(sum(x[(u, d, "NIGHT")] for d in range(num_days)) <= max_nights)

    work_counts = []
    abs_work_diffs = []
    off_counts = []
    abs_off_diffs = []

    total_assignments = 0
    for d in range(num_days):
        total_assignments += sum(
            per_day_requirements[d][code] for code in WORK_SHIFT_CODES if code != "DAY"
        )
        total_assignments += desired_day_per_day[d]
    target_work = total_assignments // num_members if num_members else 0

    total_off_available = num_days * num_members - total_assignments
    target_off = total_off_available // num_members if num_members else 0

    off_slack_vars = []
    member_off_requirements: List[int] = []

    for u in range(num_members):
        off_count_expr = sum(x[(u, d, "OFF")] for d in range(num_days))
        off_counts.append(off_count_expr)

        required_off_days = min_off_by_type.get(members[u].employment_type, default_min_off)
        member_off_requirements.append(required_off_days)

        if required_off_days > 0:
            off_slack = model.NewIntVar(0, num_days, f"off_slack_{u}")
            model.Add(off_count_expr + off_slack >= required_off_days)
        else:
            off_slack = model.NewConstant(0)
        off_slack_vars.append(off_slack)

        work_count = model.NewIntVar(0, num_days, f"work_count_{u}")
        model.Add(work_count == num_days - off_count_expr)
        work_counts.append(work_count)

        work_diff = model.NewIntVar(-num_days, num_days, f"work_diff_{u}")
        model.Add(work_diff == work_count - target_work)
        abs_work_diff = model.NewIntVar(0, num_days, f"abs_work_diff_{u}")
        model.AddAbsEquality(abs_work_diff, work_diff)
        abs_work_diffs.append(abs_work_diff)

        off_diff = model.NewIntVar(-num_days, num_days, f"off_diff_{u}")
        model.Add(off_diff == off_count_expr - target_off)
        abs_off_diff = model.NewIntVar(0, num_days, f"abs_off_diff_{u}")
        model.AddAbsEquality(abs_off_diff, off_diff)
        abs_off_diffs.append(abs_off_diff)

    coverage_penalty = 100_000
    off_requirement_penalty = 1_000
    day_target_penalty = 5_000

    objective_terms = [coverage_penalty * sum(shortage_vars.values())]
    if off_slack_vars:
        objective_terms.append(off_requirement_penalty * sum(off_slack_vars))
    if day_shortfall_vars:
        objective_terms.append(day_target_penalty * sum(day_shortfall_vars.values()))
    if balance_workload:
        objective_terms.append(10 * sum(abs_work_diffs) + 5 * sum(abs_off_diffs))

    model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    status_map = {
        cp_model.OPTIMAL: "optimal",
        cp_model.FEASIBLE: "feasible",
        cp_model.INFEASIBLE: "infeasible",
        cp_model.MODEL_INVALID: "invalid",
        cp_model.UNKNOWN: "unknown",
    }
    status_label = status_map.get(status, "unknown")

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        summary = {
            "status": status_label,
            "work_days": {},
            "off_days": {},
            "nights": {},
            "shift_breakdown": {code: 0 for code in WORK_SHIFT_CODES},
            "shortages": [],
            "day_capacity_shortfalls": [],
            "constraint_conflicts": conflicts,
        }

        return {
            "assignments": [],
            "summary": summary,
        }

    assignments = []
    output_shift_codes = WORK_SHIFT_CODES + ["NIGHT_AFTER", "OFF"]
    unique_shift_users = {code: set() for code in WORK_SHIFT_CODES}
    night_users_by_day: List[Set[int]] = [set() for _ in range(num_days)]
    for d, date in enumerate(days):
        day_entry = {"date": date, "shifts": {}}
        for s in output_shift_codes:
            assigned_users = []
            for u, member in enumerate(members):
                if solver.Value(x[(u, d, s)]) == 1:
                    assigned_users.append({"user_id": member.id})

            if not assigned_users:
                continue

            if s == "NIGHT":
                for item in assigned_users:
                    night_users_by_day[d].add(item["user_id"])

            if generation_end_date and day_dates[d] > generation_end_date:
                if s == "NIGHT_AFTER":
                    assigned_users = [
                        item
                        for item in assigned_users
                        if d > 0 and item["user_id"] in night_users_by_day[d - 1]
                    ]
                elif s == "OFF":
                    assigned_users = [
                        item
                        for item in assigned_users
                        if d > 1 and item["user_id"] in night_users_by_day[d - 2]
                    ]
                else:
                    assigned_users = []

            if not assigned_users:
                continue

            if s in unique_shift_users:
                for item in assigned_users:
                    unique_shift_users[s].add(item["user_id"])

            if len(assigned_users) == 1:
                day_entry["shifts"][s] = assigned_users[0]
            else:
                day_entry["shifts"][s] = assigned_users
        assignments.append(day_entry)

    shortages = []
    for (d, s), var in shortage_vars.items():
        amount = int(solver.Value(var))
        if amount > 0:
            shortages.append({
                "date": days[d],
                "shift_code": s,
                "missing": amount,
            })

    day_capacity_shortfalls = []
    for d, var in day_shortfall_vars.items():
        shortfall = int(solver.Value(var))
        if shortfall > 0:
            day_capacity_shortfalls.append(
                {
                    "date": days[d],
                    "shift_code": "DAY",
                    "shortfall": shortfall,
                    "unused_capacity": shortfall,
                    "desired": desired_day_per_day[d],
                }
            )

    for u, slack in enumerate(off_slack_vars):
        required_off = member_off_requirements[u]
        if required_off <= 0:
            continue
        shortfall = int(solver.Value(slack))
        if shortfall > 0:
            conflicts.append(
                {
                    "type": "off_requirement_shortfall",
                    "member_id": members[u].id,
                    "shortfall": shortfall,
                    "required": required_off,
                }
            )

    summary = {
        "status": status_label,
        "work_days": {members[u].id: int(solver.Value(work_counts[u])) for u in range(num_members)},
        "off_days": {
            members[u].id: int(solver.Value(off_counts[u])) for u in range(num_members)
        },
        "nights": {
            members[u].id: int(
                sum(solver.Value(x[(u, d, "NIGHT")]) for d in range(num_days))
            )
            for u in range(num_members)
        },
        "shift_breakdown": {code: len(unique_shift_users[code]) for code in WORK_SHIFT_CODES},
        "shortages": shortages,
        "day_capacity_shortfalls": day_capacity_shortfalls,
        "constraint_conflicts": conflicts,
    }

    output = {
        "assignments": assignments,
        "summary": summary,
    }

    print(json.dumps(output))


def main():
    data = parse_input()
    build_model(data)


if __name__ == "__main__":
    main()
