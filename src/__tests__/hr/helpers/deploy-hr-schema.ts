import { prisma } from '@test/helpers/integration-test-setup';

/** Deploy hr.compute_gratuity() and factory CHECK — not created by prisma db push. */
export async function deployHrSchema(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION hr.compute_gratuity(
      p_employee_id UUID,
      p_exit_date   DATE DEFAULT CURRENT_DATE
    ) RETURNS NUMERIC(14,2) LANGUAGE plpgsql AS $$
    DECLARE
      v_join_date   DATE;
      v_basic       NUMERIC(12,2);
      v_years       NUMERIC(5,2);
      v_months      INTEGER;
    BEGIN
      SELECT e.join_date, e.basic_salary INTO v_join_date, v_basic
      FROM hr.employees e WHERE e.id = p_employee_id AND e.deleted_at IS NULL;
      IF v_join_date IS NULL THEN
        RETURN 0;
      END IF;
      v_months := (DATE_PART('year', age(p_exit_date, v_join_date)) * 12
                   + DATE_PART('month', age(p_exit_date, v_join_date)))::INTEGER;
      v_years := TRUNC(v_months / 12.0) + CASE WHEN (v_months % 12) >= 6 THEN 1 ELSE 0 END;
      IF v_years < 1 THEN RETURN 0; END IF;
      RETURN ROUND(v_basic * (30.0 / 26.0) * v_years, 2);
    END;
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE hr.employees DROP CONSTRAINT IF EXISTS chk_factory_cat
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE hr.employees ADD CONSTRAINT chk_factory_cat
      CHECK (employee_category != 'factory' OR factory_category IS NOT NULL)
  `);
}
