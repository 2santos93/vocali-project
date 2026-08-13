import { computed, onMounted } from 'vue';
import type { ComputedRef } from 'vue';
import { SYSTEM_DARK_QUERY } from '../utils/theme';

export const SYSTEM_DARK_STATE_KEY = 'theme.systemPrefersDark';

let watchingSystemScheme = false;

export function useSystemPrefersDark(): ComputedRef<boolean> {
  const prefersDark = useState<boolean>(SYSTEM_DARK_STATE_KEY, () => false);

  onMounted(() => {
    if (watchingSystemScheme) return;

    watchingSystemScheme = true;

    const query = window.matchMedia(SYSTEM_DARK_QUERY);

    prefersDark.value = query.matches;
    query.addEventListener('change', (event) => {
      prefersDark.value = event.matches;
    });
  });

  return computed<boolean>(() => prefersDark.value);
}
