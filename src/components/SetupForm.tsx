"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAirCompass, SAMPLE_FAMILY_PROFILE } from "./AirCompassProvider";
import type { Profile, CommuteMode } from "@/lib/types";
import type { GeoResult } from "@/lib/providers/geocode";

export function SetupForm() {
  const router = useRouter();
  const { profile, saveProfile, lang, t } = useAirCompass();
  const initial = profile ?? SAMPLE_FAMILY_PROFILE;

  const [place, setPlace] = useState(initial.place);
  const [searchQuery, setSearchQuery] = useState(initial.place.name);
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [adults, setAdults] = useState(initial.household.adults);
  const [children, setChildren] = useState(initial.household.children);
  const [seniors, setSeniors] = useState(initial.household.seniors);
  const [conditions, setConditions] = useState<("respiratory" | "cardiac" | "pregnant")[]>(
    initial.household.conditions,
  );
  const [homeType, setHomeType] = useState(initial.home.type);
  const [windows, setWindows] = useState(initial.home.windows);
  const [ac, setAc] = useState(initial.home.ac);
  const [purifier, setPurifier] = useState(initial.home.purifier);
  const [cooking, setCooking] = useState(initial.home.cooking);
  const [roomAreaM2, setRoomAreaM2] = useState(initial.home.roomAreaM2);
  const [commuteMode, setCommuteMode] = useState<CommuteMode>(initial.commute.mode);
  const [km, setKm] = useState(initial.commute.km);
  const [daysPerWeek, setDaysPerWeek] = useState(initial.commute.daysPerWeek);
  const [morningExercise, setMorningExercise] = useState(initial.habits.morningOutdoorExercise);
  const [schoolRun, setSchoolRun] = useState(initial.habits.schoolRun);
  const [budget, setBudget] = useState(initial.budget);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function handleSearchPlace() {
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery.trim())}`);
      if (res.ok) {
        const data = (await res.json()) as { results: GeoResult[] };
        setGeoResults(data.results);
      }
    } catch {
      setError(t("setup.error_search"));
    }
  }

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setError(t("setup.error_geo_unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const currentLocation = t("setup.current_location");
        setPlace({
          name: currentLocation,
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lon: Math.round(pos.coords.longitude * 100) / 100,
          country: "IN",
        });
        setSearchQuery(currentLocation);
        setGeoResults([]);
      },
      () => setError(t("setup.error_geo_denied")),
    );
  }

  function toggleCondition(c: "respiratory" | "cardiac" | "pregnant") {
    setConditions((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (adults < 1 || roomAreaM2 < 4) {
      setError(t("setup.error_validation"));
      return;
    }
    setSubmitting(true);
    const nextProfile: Profile = {
      lang,
      place,
      household: { adults, children, seniors, conditions },
      home: { type: homeType, windows, ac, purifier, cooking, roomAreaM2 },
      commute: { mode: commuteMode, km, daysPerWeek },
      habits: { morningOutdoorExercise: morningExercise, schoolRun },
      budget,
      ...(notes.trim() ? { notes: notes.trim().slice(0, 300) } : {}),
    };
    await saveProfile(nextProfile);
    setSubmitting(false);
    router.push("/plan");
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="max-w-2xl space-y-6">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight">
        {t("setup.title")}
      </h1>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950 border border-rose-300 text-rose-800 dark:text-rose-200 text-sm">
          {error}
        </div>
      )}

      {/* Location */}
      <fieldset className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <legend className="text-base font-semibold px-1">{t("setup.place")}</legend>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="place-search" className="sr-only">
            {t("setup.place_search")}
          </label>
          <input
            id="place-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("setup.place_search")}
            className="flex-1 min-w-[200px] min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
          />
          <button
            type="button"
            onClick={() => void handleSearchPlace()}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 text-sm font-medium"
          >
            {t("setup.search")}
          </button>
          <button
            type="button"
            onClick={handleUseLocation}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
          >
            {t("setup.use_location")}
          </button>
        </div>
        {geoResults.length > 0 && (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            {geoResults.map((g, idx) => (
              <li key={`${g.name}-${idx}`}>
                <button
                  type="button"
                  onClick={() => {
                    setPlace({ name: g.name, lat: g.lat, lon: g.lon, country: g.country || "IN" });
                    setSearchQuery(g.name);
                    setGeoResults([]);
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px]"
                >
                  {g.name} {g.region ? `(${g.region}, ${g.country})` : `(${g.country})`}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("setup.selected", {
            name: place.name,
            lat: place.lat,
            lon: place.lon,
            country: place.country,
          })}
        </p>
      </fieldset>

      {/* Household */}
      <fieldset className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <legend className="text-base font-semibold px-1">{t("setup.household")}</legend>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="adults" className="block text-sm font-medium mb-1">
              {t("setup.adults")}
            </label>
            <input
              id="adults"
              type="number"
              min={1}
              max={20}
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>
          <div>
            <label htmlFor="children" className="block text-sm font-medium mb-1">
              {t("setup.children")}
            </label>
            <input
              id="children"
              type="number"
              min={0}
              max={20}
              value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>
          <div>
            <label htmlFor="seniors" className="block text-sm font-medium mb-1">
              {t("setup.seniors")}
            </label>
            <input
              id="seniors"
              type="number"
              min={0}
              max={20}
              value={seniors}
              onChange={(e) => setSeniors(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium">{t("setup.conditions")}</span>
          <div className="flex flex-wrap gap-3">
            {(["respiratory", "cardiac", "pregnant"] as const).map((c) => (
              <label key={c} className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={conditions.includes(c)}
                  onChange={() => toggleCondition(c)}
                  className="w-4 h-4"
                />
                <span className="text-sm">{t(`setup.${c}`)}</span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      {/* Home */}
      <fieldset className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <legend className="text-base font-semibold px-1">{t("setup.home")}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="home-type" className="block text-sm font-medium mb-1">
              {t("setup.home_type")}
            </label>
            <select
              id="home-type"
              value={homeType}
              onChange={(e) => setHomeType(e.target.value as "apartment" | "house")}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="apartment">{t("setup.apartment")}</option>
              <option value="house">{t("setup.house")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="windows" className="block text-sm font-medium mb-1">
              {t("setup.windows")}
            </label>
            <select
              id="windows"
              value={windows}
              onChange={(e) => setWindows(e.target.value as "sealed" | "normal" | "leaky")}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="sealed">{t("setup.sealed")}</option>
              <option value="normal">{t("setup.normal")}</option>
              <option value="leaky">{t("setup.leaky")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="purifier" className="block text-sm font-medium mb-1">
              {t("setup.purifier")}
            </label>
            <select
              id="purifier"
              value={purifier}
              onChange={(e) => setPurifier(e.target.value as "none" | "hepa" | "diy")}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="none">{t("setup.none")}</option>
              <option value="hepa">{t("setup.hepa")}</option>
              <option value="diy">{t("setup.diy")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="cooking" className="block text-sm font-medium mb-1">
              {t("setup.cooking")}
            </label>
            <select
              id="cooking"
              value={cooking}
              onChange={(e) => setCooking(e.target.value as "lpg" | "induction" | "biomass" | "other")}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="lpg">{t("setup.lpg")}</option>
              <option value="induction">{t("setup.induction")}</option>
              <option value="biomass">{t("setup.biomass")}</option>
              <option value="other">{t("setup.other")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="room-size" className="block text-sm font-medium mb-1">
              {t("setup.room_size")}
            </label>
            <input
              id="room-size"
              type="number"
              min={4}
              max={200}
              value={roomAreaM2}
              onChange={(e) => setRoomAreaM2(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={ac} onChange={(e) => setAc(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm">{t("setup.ac")}</span>
            </label>
          </div>
        </div>
      </fieldset>

      {/* Commute & Habits */}
      <fieldset className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <legend className="text-base font-semibold px-1">{t("setup.commute")}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="commute-mode" className="block text-sm font-medium mb-1">
              {t("setup.mode")}
            </label>
            <select
              id="commute-mode"
              value={commuteMode}
              onChange={(e) => setCommuteMode(e.target.value as CommuteMode)}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              {(["car", "two_wheeler", "auto", "bus", "metro", "walk", "cycle", "wfh"] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`setup.${m}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="commute-km" className="block text-sm font-medium mb-1">
              {t("setup.km")}
            </label>
            <input
              id="commute-km"
              type="number"
              min={0}
              max={200}
              value={km}
              onChange={(e) => setKm(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>
          <div>
            <label htmlFor="commute-days" className="block text-sm font-medium mb-1">
              {t("setup.days_per_week")}
            </label>
            <input
              id="commute-days"
              type="number"
              min={0}
              max={7}
              value={daysPerWeek}
              onChange={(e) => setDaysPerWeek(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              checked={morningExercise}
              onChange={(e) => setMorningExercise(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">{t("setup.morning_exercise")}</span>
          </label>
          <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              checked={schoolRun}
              onChange={(e) => setSchoolRun(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">{t("setup.school_run")}</span>
          </label>
        </div>

        <div>
          <label htmlFor="budget" className="block text-sm font-medium mb-1">
            {t("setup.budget")}
          </label>
          <select
            id="budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value as "zero" | "low" | "medium")}
            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="zero">{t("setup.zero")}</option>
            <option value="low">{t("setup.low")}</option>
            <option value="medium">{t("setup.medium")}</option>
          </select>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium mb-1">
            {t("setup.notes")}
          </label>
          <textarea
            id="notes"
            maxLength={300}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
          />
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={submitting}
        className="min-h-[44px] px-6 py-3 rounded-xl bg-teal-700 text-white font-semibold hover:bg-teal-800 disabled:opacity-50"
      >
        {submitting ? t("app.loading") : t("setup.save")}
      </button>
    </form>
  );
}
