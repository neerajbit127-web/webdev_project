const bcrypt = require('bcryptjs');
const db = require('./db');

async function seedDatabase() {
  console.log('[Seed] Seeding sample data into database...');
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Password Hash
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password123', salt);

    // 2. Insert Teacher
    const teacherRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3
       RETURNING id`,
      ['Dr. Alan Vance', 'alan.vance@university.edu', passwordHash, 'TEACHER', 'Dept. of Computer Science']
    );
    const teacherId = teacherRes.rows[0].id;

    // 3. Insert Student
    await client.query(
      `INSERT INTO users (name, email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3`,
      ['Elena Rostova', 'ST-94821', passwordHash, 'STUDENT', 'Dept. of Computer Science']
    );

    // 4. Insert Sample Exam 1: EXAM-4020
    const exam1Res = await client.query(
      `INSERT INTO exams (code, teacher_id, title, description, duration_minutes, batch, passing_percentage, total_marks, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (code) DO UPDATE SET title = $3
       RETURNING id`,
      [
        'EXAM-4020',
        teacherId,
        'CS402: Advanced Distributed Systems',
        'Final Examination assessing consensus protocols, fault tolerance, and vector clocks.',
        45,
        'Fall 2026 CS Senior',
        60.00,
        10.00,
        true
      ]
    );
    const exam1Id = exam1Res.rows[0].id;

    // Sample Questions for Exam 1
    const questions1 = [
      {
        prompt: 'In the Raft consensus algorithm, which condition must be met before a Leader node is permitted to safely commit a log entry originated from its current term to the state machine?',
        options: [
          'The entry has been replicated on at least one candidate node and verified by a two-phase commit coordinator.',
          'The entry has been successfully replicated on a strict majority (quorum) of the cluster servers.',
          'Every follower has responded with an explicit acknowledgement and applied the command locally.',
          'The entry matches the hash sequence of an entry previously committed in an earlier epoch.'
        ],
        correctIndex: 1
      },
      {
        prompt: 'Which guarantee is provided by Byzantine Fault Tolerance (BFT) algorithms in a network of N nodes?',
        options: [
          'Tolerates up to (N-1)/3 malicious or failing nodes while maintaining consensus.',
          'Requires absolute synchronous physical clocks across all member nodes.',
          'Guarantees zero latency on cross-datacenter state machine replication.',
          'Eliminates the possibility of network partitioning.'
        ],
        correctIndex: 0
      },
      {
        prompt: 'In distributed transaction processing, what is the primary operational weakness of the standard Two-Phase Commit (2PC) protocol?',
        options: [
          'It requires exponential message complexity O(2^N).',
          'It is a blocking protocol; if the Coordinator crashes during the prepare phase, Cohorts may remain indefinitely blocked.',
          'It cannot support ACID properties across relational databases.',
          'It does not allow multiple read queries simultaneously.'
        ],
        correctIndex: 1
      },
      {
        prompt: 'What core property does the CAP Theorem state a distributed data store can NEVER simultaneously provide in the event of a network partition (P)?',
        options: [
          'Performance and Security.',
          'Consistency and Availability.',
          'Latency and Fault Recovery.',
          'Durability and Atomicity.'
        ],
        correctIndex: 1
      },
      {
        prompt: 'How does vector clock synchronization differ from standard Lamport timestamps in distributed systems?',
        options: [
          'Vector clocks can establish causal concurrency and determine if two events are causally independent.',
          'Vector clocks rely strictly on hardware GPS atomic clocks.',
          'Vector clocks reduce storage size to a single 64-bit integer.',
          'Lamport timestamps are only applicable to single-node relational databases.'
        ],
        correctIndex: 0
      }
    ];

    // Delete existing questions for fresh seed
    await client.query('DELETE FROM questions WHERE exam_id = $1', [exam1Id]);

    for (let i = 0; i < questions1.length; i++) {
      const q = questions1[i];
      const qRes = await client.query(
        `INSERT INTO questions (exam_id, question_text, question_order, marks, negative_marks)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [exam1Id, q.prompt, i + 1, 2.00, 0.50]
      );
      const questionId = qRes.rows[0].id;

      for (let j = 0; j < q.options.length; j++) {
        await client.query(
          `INSERT INTO options (question_id, option_index, option_text, is_correct)
           VALUES ($1, $2, $3, $4)`,
          [questionId, j, q.options[j], j === q.correctIndex]
        );
      }
    }

    await client.query('COMMIT');
    console.log('[Seed] Database seeded with initial users and assessments.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed Error]:', err.message);
  } finally {
    client.release();
    await db.pool.end();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
