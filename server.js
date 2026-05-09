require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Conectar Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ============================================
// TESTE DE CONEXÃO
// ============================================
app.get("/api/health", async (req, res) => {
	try {
		const { data, error } = await supabase.from("alunos").select("count");
		if (error) {
			res.json({ status: "erro", message: error.message });
		} else {
			res.json({ status: "ok", message: "Conectado ao Supabase!" });
		}
	} catch (err) {
		res.json({ status: "erro", message: err.message });
	}
});

// ============================================
// ALUNOS
// ============================================
app.get("/api/alunos", async (req, res) => {
	const { data, error } = await supabase
		.from("alunos")
		.select("*")
		.order("pontos", { ascending: false });

	if (error) return res.status(500).json({ error: error.message });
	res.json(data);
});

app.post("/api/alunos", async (req, res) => {
	const { nome } = req.body;
	const { data, error } = await supabase
		.from("alunos")
		.insert([{ nome, pontos: 0 }])
		.select();

	if (error) return res.status(500).json({ error: error.message });
	res.json(data[0]);
});

app.put("/api/alunos/:id/pontos", async (req, res) => {
	const { id } = req.params;
	const { pontos, motivo } = req.body;
	const dataAtual = new Date().toLocaleString("pt-BR");

	const { data: aluno } = await supabase
		.from("alunos")
		.select("pontos")
		.eq("id", id)
		.single();

	if (!aluno) return res.status(404).json({ error: "Aluno não encontrado" });

	const novosPontos = aluno.pontos + pontos;

	const { error: updateError } = await supabase
		.from("alunos")
		.update({ pontos: novosPontos })
		.eq("id", id);

	if (updateError) return res.status(500).json({ error: updateError.message });

	await supabase
		.from("historico")
		.insert([{ aluno_id: id, tipo: motivo, pontos, data: dataAtual }]);

	res.json({ success: true, novosPontos });
});

app.post("/api/alunos/reset-all", async (req, res) => {
	const { error } = await supabase.from("alunos").update({ pontos: 0 }).neq("id", 0);

	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

// ============================================
// HISTÓRICO
// ============================================
app.get("/api/historico/:alunoId", async (req, res) => {
	const { alunoId } = req.params;
	const { data, error } = await supabase
		.from("historico")
		.select("*")
		.eq("aluno_id", alunoId)
		.order("id", { ascending: false })
		.limit(20);

	if (error) return res.status(500).json({ error: error.message });
	res.json(data);
});

// ============================================
// RECOMPENSAS
// ============================================
app.get("/api/recompensas", async (req, res) => {
	const { data, error } = await supabase.from("recompensas").select("*").order("custo");

	if (error) return res.status(500).json({ error: error.message });
	res.json(data);
});

app.post("/api/recompensas", async (req, res) => {
	const { nome, custo } = req.body;
	const { data, error } = await supabase
		.from("recompensas")
		.insert([{ nome, custo }])
		.select();

	if (error) return res.status(500).json({ error: error.message });
	res.json(data[0]);
});

app.delete("/api/recompensas/:id", async (req, res) => {
	const { id } = req.params;
	const { error } = await supabase.from("recompensas").delete().eq("id", id);

	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

// ============================================
// SOLICITAÇÕES
// ============================================
app.get("/api/solicitacoes", async (req, res) => {
	const { data, error } = await supabase
		.from("solicitacoes")
		.select("*")
		.eq("status", "pendente")
		.order("id", { ascending: false });

	if (error) return res.status(500).json({ error: error.message });
	res.json(data);
});

app.post("/api/solicitacoes", async (req, res) => {
	const { aluno_id, recompensa_id, recompensa_nome, custo } = req.body;
	const dataAtual = new Date().toLocaleString("pt-BR");

	const { data, error } = await supabase
		.from("solicitacoes")
		.insert([
			{
				aluno_id,
				recompensa_id,
				recompensa_nome,
				custo,
				status: "pendente",
				data: dataAtual,
			},
		])
		.select();

	if (error) return res.status(500).json({ error: error.message });
	res.json(data[0]);
});

app.put("/api/solicitacoes/:id/aprovar", async (req, res) => {
	const { id } = req.params;
	const { aluno_id, custo, recompensa_nome } = req.body;
	const dataAtual = new Date().toLocaleString("pt-BR");

	const { data: aluno } = await supabase
		.from("alunos")
		.select("pontos")
		.eq("id", aluno_id)
		.single();

	if (!aluno || aluno.pontos < custo) {
		return res.status(400).json({ error: "Pontos insuficientes" });
	}

	const novosPontos = aluno.pontos - custo;
	await supabase.from("alunos").update({ pontos: novosPontos }).eq("id", aluno_id);

	await supabase.from("historico").insert([
		{
			aluno_id,
			tipo: `Resgate: ${recompensa_nome}`,
			pontos: -custo,
			data: dataAtual,
		},
	]);

	const { error } = await supabase
		.from("solicitacoes")
		.update({ status: "aprovado" })
		.eq("id", id);

	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

app.delete("/api/solicitacoes/:id/rejeitar", async (req, res) => {
	const { id } = req.params;
	const { error } = await supabase
		.from("solicitacoes")
		.update({ status: "rejeitado" })
		.eq("id", id);

	if (error) return res.status(500).json({ error: error.message });
	res.json({ success: true });
});

// ============================================
// CONFIG (valores fixos)
// ============================================
app.get("/api/config", (req, res) => {
	res.json({ pontos_presenca: 5, pontos_tarefa: 10, pontos_participacao: 10 });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
	console.log(`
  ════════════════════════════════════════════
  🚀 Backend rodando em http://localhost:${PORT}
  📡 Conectado ao Supabase
  ════════════════════════════════════════════
  `);
});
