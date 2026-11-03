import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { provisionDisciplinaryCategories } from './provision-disciplinary-categories';

async function run(): Promise<void> {
  let prisma: PrismaService | undefined;
  try {
    prisma = new PrismaService(new ConfigService());
    await prisma.onModuleInit();
    const result = await provisionDisciplinaryCategories(prisma);
    process.stdout.write(`Categorias disciplinares criadas: ${result.count}\n`);
  } catch {
    // Never print driver errors: they can contain connection credentials.
    process.stderr.write(
      'Não foi possível provisionar as categorias. Verifique a configuração, a conexão e as migrations do ambiente.\n',
    );
    process.exitCode = 1;
  } finally {
    try {
      await prisma?.onModuleDestroy();
    } catch {
      process.stderr.write(
        'Não foi possível encerrar a conexão de provisionamento.\n',
      );
      process.exitCode = 1;
    }
  }
}

// Importing the catalog or starting the API never provisions data implicitly.
if (require.main === module) void run();
