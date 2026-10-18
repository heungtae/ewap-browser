import { runtime } from "./settings-browser.js";
import { initializeSettingsNavigation } from "./settings-navigation.js";
import { initializeFormFeedback } from "./form-feedback.js";
import { initializeProviderManagement } from "./provider-management.js";
import { loadProviderForm } from "./provider-form-fields.js";
import { createProviderSave } from "./provider-form-save.js";
import { initializeProviderTest } from "./provider-test-controls.js";
import { initializeProviderModels } from "./provider-model-controls.js";
import { initializeProviderNetwork } from "./provider-network-controls.js";
import { initializeResolverForm } from "./resolver-form.js";
import { initializeWorkflowSettings } from "./workflow-settings.js";
import { initializeAgentPreferences } from "./agent-preferences-form.js";
import { initializeSettingsPermissions } from "./settings-permissions.js";
import { initializeLearnedProfileOptions } from "./learned-profile-options.js";
initializeSettingsNavigation();
initializeFormFeedback();
if (runtime) {
  const management = initializeProviderManagement(runtime, loadProviderForm);
  const save = createProviderSave(management);
  initializeProviderTest(save);
  initializeProviderModels(save);
  initializeLearnedProfileOptions(runtime);
}
initializeProviderNetwork();
initializeResolverForm();
initializeWorkflowSettings();
initializeAgentPreferences();
initializeSettingsPermissions();
