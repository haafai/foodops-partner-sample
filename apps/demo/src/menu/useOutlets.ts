import { useQuery } from '@tanstack/react-query';
import { useSession } from '../config/SessionProvider';

export function useOutlets() {
  const { client } = useSession();
  return useQuery({
    queryKey: ['outlets'],
    queryFn: () => client!.listOutlets(),
    enabled: client !== null,
    staleTime: 60_000,
  });
}
