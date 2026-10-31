import type { ProfileVerificationProvider } from './types.ts';
import {
  ExportEvidenceProvider,
  EXPORT_EVIDENCE_PROVIDER_ID,
} from './providers/export-evidence.provider.ts';
import {
  OfficialApiProvider,
} from './providers/official-api.provider.ts';

export class ProviderRegistry {
  private providers = new Map<string, ProfileVerificationProvider>();
  private defaultProviderId = EXPORT_EVIDENCE_PROVIDER_ID;

  constructor() {
    this.register(new ExportEvidenceProvider());
    this.register(new OfficialApiProvider());
  }

  register(provider: ProfileVerificationProvider) {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: string): boolean {
    if (providerId === this.defaultProviderId) {
      return false; // Cannot unregister the default provider
    }
    return this.providers.delete(providerId);
  }

  get(providerId: string): ProfileVerificationProvider | undefined {
    return this.providers.get(providerId);
  }

  getDefault(): ProfileVerificationProvider {
    return (
      this.providers.get(this.defaultProviderId) ??
      new ExportEvidenceProvider()
    );
  }

  setDefault(providerId: string): boolean {
    if (this.providers.has(providerId)) {
      this.defaultProviderId = providerId;
      return true;
    }
    return false;
  }

  getAll(): ProfileVerificationProvider[] {
    return [...this.providers.values()];
  }
}

// Global registry singleton
export const providerRegistry = new ProviderRegistry();
