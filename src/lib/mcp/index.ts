import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listFamilies from "./tools/list-families";
import getFamily from "./tools/get-family";
import listAppointments from "./tools/list-appointments";
import listPotentials from "./tools/list-potentials";
import createPotential from "./tools/create-potential";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "migdal-or-crm-mcp",
  title: "Migdal Or CRM",
  version: "0.1.0",
  instructions:
    "Tools for the Migdal Or registration CRM. Read and search families (students), appointments, and potential (prospective) students, and create new potentials.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listFamilies, getFamily, listAppointments, listPotentials, createPotential],
});
