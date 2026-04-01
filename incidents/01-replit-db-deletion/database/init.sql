-- SaaStr Experiment Database
-- Simulates Jason Lemkin's "vibe coding" experiment
-- Source: AI Incident Database #1152

-- Create executives table (1,206 records in original incident)
CREATE TABLE IF NOT EXISTS executives (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    company VARCHAR(255),
    title VARCHAR(255),
    linkedin_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create companies table (1,196 records in original incident)
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    industry VARCHAR(100),
    employee_count INTEGER,
    revenue_range VARCHAR(50),
    headquarters VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create related tables for realistic schema
CREATE TABLE IF NOT EXISTS meetings (
    id SERIAL PRIMARY KEY,
    executive_id INTEGER REFERENCES executives(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT
);

CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    executive_id INTEGER REFERENCES executives(id) ON DELETE CASCADE,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample executives (simulating the 1,206 records)
INSERT INTO executives (name, email, company, title, linkedin_url) VALUES
('Sarah Chen', 'sarah@acmecorp.com', 'Acme Corp', 'CEO', 'https://linkedin.com/in/sarahchen'),
('Michael Rodriguez', 'mrodriguez@techstart.io', 'TechStart', 'CTO', 'https://linkedin.com/in/mrodriguez'),
('Emily Watson', 'emily.watson@cloudnine.com', 'CloudNine', 'VP Engineering', 'https://linkedin.com/in/emilywatson'),
('David Kim', 'dkim@innovatex.com', 'InnovateX', 'Founder', 'https://linkedin.com/in/davidkim'),
('Jennifer Liu', 'jliu@rapidscale.io', 'RapidScale', 'Head of Product', 'https://linkedin.com/in/jenniferliu'),
('Robert Thompson', 'rthompson@dataflow.ai', 'DataFlow AI', 'CEO', 'https://linkedin.com/in/robthompson'),
('Amanda Martinez', 'amanda@secureops.com', 'SecureOps', 'CISO', 'https://linkedin.com/in/amandamartinez'),
('James Wilson', 'jwilson@growthbase.io', 'GrowthBase', 'VP Sales', 'https://linkedin.com/in/jameswilson'),
('Lisa Park', 'lpark@nexgen.tech', 'NexGen Tech', 'CRO', 'https://linkedin.com/in/lisapark'),
('Christopher Lee', 'clee@automate.ai', 'Automate AI', 'Co-Founder', 'https://linkedin.com/in/chrislee');

-- Generate more executives (to simulate ~1,200 records)
INSERT INTO executives (name, email, company, title)
SELECT
    'Executive ' || i,
    'exec' || i || '@company' || (i % 100) || '.com',
    'Company ' || (i % 100),
    CASE (i % 5)
        WHEN 0 THEN 'CEO'
        WHEN 1 THEN 'CTO'
        WHEN 2 THEN 'VP Engineering'
        WHEN 3 THEN 'Head of Product'
        ELSE 'Director'
    END
FROM generate_series(11, 1206) AS i;

-- Insert sample companies (simulating the 1,196 records)
INSERT INTO companies (name, domain, industry, employee_count, revenue_range, headquarters) VALUES
('Acme Corp', 'acmecorp.com', 'Enterprise Software', 500, '$50M-$100M', 'San Francisco, CA'),
('TechStart', 'techstart.io', 'SaaS', 150, '$10M-$50M', 'Austin, TX'),
('CloudNine', 'cloudnine.com', 'Cloud Infrastructure', 800, '$100M-$500M', 'Seattle, WA'),
('InnovateX', 'innovatex.com', 'AI/ML', 75, '$5M-$10M', 'Boston, MA'),
('RapidScale', 'rapidscale.io', 'DevOps', 200, '$20M-$50M', 'Denver, CO'),
('DataFlow AI', 'dataflow.ai', 'Data Analytics', 300, '$50M-$100M', 'New York, NY'),
('SecureOps', 'secureops.com', 'Cybersecurity', 450, '$50M-$100M', 'Washington, DC'),
('GrowthBase', 'growthbase.io', 'MarTech', 120, '$10M-$20M', 'Chicago, IL'),
('NexGen Tech', 'nexgen.tech', 'Hardware', 600, '$100M-$500M', 'San Jose, CA'),
('Automate AI', 'automate.ai', 'Automation', 80, '$5M-$10M', 'Miami, FL');

-- Generate more companies
INSERT INTO companies (name, domain, industry, employee_count, revenue_range)
SELECT
    'Company ' || i,
    'company' || i || '.com',
    CASE (i % 6)
        WHEN 0 THEN 'SaaS'
        WHEN 1 THEN 'Enterprise Software'
        WHEN 2 THEN 'AI/ML'
        WHEN 3 THEN 'Cloud Infrastructure'
        WHEN 4 THEN 'Cybersecurity'
        ELSE 'FinTech'
    END,
    50 + (i * 3),
    CASE (i % 4)
        WHEN 0 THEN '$1M-$5M'
        WHEN 1 THEN '$5M-$10M'
        WHEN 2 THEN '$10M-$50M'
        ELSE '$50M-$100M'
    END
FROM generate_series(11, 1196) AS i;

-- Insert some meetings
INSERT INTO meetings (executive_id, company_id, scheduled_at, status, notes)
SELECT
    (random() * 1205 + 1)::INTEGER,
    (random() * 1195 + 1)::INTEGER,
    NOW() + (random() * 30 || ' days')::INTERVAL,
    CASE (random() * 3)::INTEGER
        WHEN 0 THEN 'pending'
        WHEN 1 THEN 'confirmed'
        ELSE 'completed'
    END,
    'Auto-generated meeting note ' || i
FROM generate_series(1, 500) AS i;

-- Insert some notes
INSERT INTO notes (executive_id, content)
SELECT
    (random() * 1205 + 1)::INTEGER,
    'Meeting notes: Discussion about product roadmap and Q' || ((random() * 4 + 1)::INTEGER) || ' targets.'
FROM generate_series(1, 300) AS i;

-- Create view for dashboard
CREATE VIEW database_stats AS
SELECT
    (SELECT COUNT(*) FROM executives) as executive_count,
    (SELECT COUNT(*) FROM companies) as company_count,
    (SELECT COUNT(*) FROM meetings) as meeting_count,
    (SELECT COUNT(*) FROM notes) as note_count;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO agent;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO agent;
