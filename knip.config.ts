import { defineKnipConfig } from "@adddog/monorepo-consistency";

export default defineKnipConfig({}, {
    ignoreDependencies: [
        "@adddog/monorepo-consistency",
    ],
    ignoreBinaries: ["knip", "unbuild", "tsx"],
});
