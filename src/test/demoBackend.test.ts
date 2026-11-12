import { describe, it, expect, beforeEach } from "vitest";
import { demoBackend, resetDemoData } from "@/lib/api/demoBackend";

describe("demo backend (mirrors server semantics)", () => {
  beforeEach(() => resetDemoData());

  it("patch merges nested documents key-by-key (no lost updates)", async () => {
    const [f] = await demoBackend.listFamilies();
    await demoBackend.patchFamily(f.id, { documents: { id_card: true } });
    await demoBackend.patchFamily(f.id, { documents: { school_cert: true } });
    await demoBackend.patchFamily(f.id, { notes: "בדיקה" });
    const after = (await demoBackend.listFamilies()).find((x) => x.id === f.id)!;
    const docs = after.data.documents as Record<string, boolean>;
    expect(docs.id_card).toBe(true);
    expect(docs.school_cert).toBe(true);
    expect(after.data.notes).toBe("בדיקה");
    expect(after.data.firstName).toBe(f.data.firstName);
  });

  it("one appointment per family; reschedule resets RSVP and moves leads", async () => {
    const fams = await demoBackend.listFamilies();
    const lead = fams.find((f) => f.data.stage === "leads")!;
    await demoBackend.patchFamily(lead.id, { rsvpStatus: "confirmed" });
    await demoBackend.setAppointment(lead.id, "2030-01-01T08:00:00.000Z");
    await demoBackend.setAppointment(lead.id, "2030-01-02T08:00:00.000Z");
    const appts = (await demoBackend.listAppointments()).filter((a) => a.family_id === lead.id);
    expect(appts).toHaveLength(1);
    expect(appts[0].date).toBe("2030-01-02T08:00:00.000Z");
    const after = (await demoBackend.listFamilies()).find((f) => f.id === lead.id)!;
    expect(after.data.rsvpStatus).toBe("pending");
    expect(after.data.stage).toBe("meeting");
    await demoBackend.setAppointment(lead.id, null);
    expect((await demoBackend.listAppointments()).some((a) => a.family_id === lead.id)).toBe(false);
  });

  it("RSVP works only with the token and logs activity", async () => {
    const f = (await demoBackend.listFamilies()).find((x) => !x.data.isArchived)!;
    expect(await demoBackend.getRsvp("not-a-token")).toBeNull();
    const info = await demoBackend.getRsvp(f.rsvp_token!);
    expect(info?.firstName).toBe(f.data.firstName);
    await demoBackend.submitRsvp(f.rsvp_token!, "reschedule_requested");
    const after = (await demoBackend.listFamilies()).find((x) => x.id === f.id)!;
    expect(after.data.rsvpStatus).toBe("reschedule_requested");
    const logs = await demoBackend.listActivity(5, f.id);
    expect(logs[0].action_type).toBe("rsvp_reschedule");
  });
});
